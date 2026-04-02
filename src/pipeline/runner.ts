import type { HarnessConfig } from '../config/schema.js';
import type { Task } from '../tasks/schema.js';
import type { TaskResult, PipelineCallbacks } from './types.js';
import type { AgentResult } from '../agents/types.js';
import type { AgentRole } from '../agents/types.js';
import { buildAgentRunConfig } from '../agents/registry.js';
import { executeAgent } from '../agents/executor.js';
import { takeSnapshot, computeSnapshotDiff, getGitDiff } from './snapshot.js';
import {
  buildPlannerPrompt,
  buildGeneratorPrompt,
  buildCodeReviewPrompt,
  buildSecurityReviewPrompt,
  buildQAPrompt,
  buildDebuggerPrompt,
} from './prompts.js';
import { gatherWorkspaceContext } from './context.js';
import { LoopDetector } from './loop-detect.js';
import { runDeterministicChecks, formatCheckResults } from './checks.js';
import { LessonStore, formatLessonsSection } from '../state/lessons.js';
import { HarnessStore } from '../state/store.js';
import { eventBus } from '../state/events.js';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export class PipelineRunner {
  private config: HarnessConfig;
  private store: HarnessStore;
  private callbacks: PipelineCallbacks;
  private aborted = false;
  private lessonStore: LessonStore;

  constructor(config: HarnessConfig, store: HarnessStore, callbacks: PipelineCallbacks = {}) {
    this.config = config;
    this.store = store;
    this.callbacks = callbacks;
    this.lessonStore = new LessonStore();
    this.lessonStore.load(config.lessons_file);
  }

  abort(): void {
    this.aborted = true;
  }

  async runAll(tasks: Task[]): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    eventBus.emit('pipeline:start', { data: { taskCount: tasks.length } });

    for (const task of tasks) {
      if (this.aborted) break;
      const existing = this.store.getTask(task.id);
      if (existing && (existing.status === 'done' || existing.status === 'failed')) continue;

      const result = await this.runTask(task);
      results.push(result);
    }

    eventBus.emit('pipeline:complete', { data: { results: results.length } });
    return results;
  }

  async runTask(task: Task): Promise<TaskResult> {
    this.callbacks.onTaskStart?.(task.id);
    const agentResults: Record<string, AgentResult> = {};
    const securityWarnings: string[] = [];
    const workdir = path.resolve(this.config.project.workdir);
    const historyDir = path.join(path.dirname(this.config.state_file), 'history', task.id);
    if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

    // Gather workspace context once at start
    const wsContext = gatherWorkspaceContext(workdir, this.store);

    // Find relevant lessons for this task
    const relevantLessons = this.lessonStore.findRelevant(task.description);

    // Create loop detector for this task
    const loopDetector = new LoopDetector();

    // 1. Planning
    this.store.updateTaskStatus(task.id, 'planning', 'planner');
    this.callbacks.onAgentStart?.(task.id, 'planner');
    const planResult = await this.runAgent('planner', buildPlannerPrompt(task, {
      context: wsContext,
      lessons: relevantLessons,
    }));
    agentResults['planner'] = planResult;
    this.callbacks.onAgentComplete?.(task.id, 'planner', planResult);
    this.saveHistory(historyDir, 'plan.json', planResult);
    const plan = planResult.output;

    // 2. Generate → Review → QA loop
    for (let attempt = 0; attempt <= this.config.pipeline.max_retry; attempt++) {
      if (this.aborted) return { taskId: task.id, status: 'failed', plan, agentResults, securityWarnings, attempts: attempt };

      this.store.incrementAttempt(task.id);

      // Check for loop
      const loopWarning = loopDetector.getWarning();

      // Generate
      this.store.updateTaskStatus(task.id, 'generating', 'generator');
      this.callbacks.onAgentStart?.(task.id, 'generator');
      const snapshotBefore = this.config.pipeline.snapshot_enabled ? takeSnapshot(workdir) : [];
      const debugFeedback = attempt > 0 ? agentResults['debugger']?.output : undefined;
      const genResult = await this.runAgent('generator', buildGeneratorPrompt(task, plan, debugFeedback, {
        context: wsContext,
        lessons: relevantLessons,
        loopWarning: loopWarning ?? undefined,
      }));
      agentResults['generator'] = genResult;
      this.callbacks.onAgentComplete?.(task.id, 'generator', genResult);
      this.saveHistory(historyDir, 'generator.json', genResult);

      // Track file edits for loop detection
      loopDetector.extractFileEditsFromToolCalls(genResult.toolCalls);

      // Record attempt output hash for loop detection
      const isLooping = loopDetector.recordAttempt(task.id, genResult.output);

      const snapshotAfter = this.config.pipeline.snapshot_enabled ? takeSnapshot(workdir) : [];
      const diff = computeSnapshotDiff(snapshotBefore, snapshotAfter);
      const changedFiles = [...diff.added, ...diff.modified];
      const gitDiff = getGitDiff(workdir, changedFiles);

      this.saveHistory(historyDir, 'snapshot_before.json', snapshotBefore);
      this.saveHistory(historyDir, 'snapshot_after.json', snapshotAfter);

      // Git checkpoint (if enabled)
      if (this.config.pipeline.auto_commit && changedFiles.length > 0) {
        this.gitCheckpoint(workdir, task.id, attempt, changedFiles);
      }

      // Deterministic checks (before code review)
      const { checks } = this.config.pipeline;
      let checkResultsText: string | undefined;

      if (checks.enabled && checks.commands.length > 0) {
        const checkResults = await runDeterministicChecks(workdir, checks.commands);
        const anyFailed = checkResults.some((r) => !r.passed);
        checkResultsText = formatCheckResults(checkResults);

        if (anyFailed) {
          // Skip code reviewer, go straight to debugger
          this.store.updateTaskStatus(task.id, 'debugging', 'debugger');
          const loopWarn = isLooping
            ? (loopDetector.getWarning() ?? undefined)
            : undefined;
          const dbgResult = await this.runAgent('debugger', buildDebuggerPrompt(
            task, plan, diff, checkResultsText,
            { lessons: relevantLessons, loopWarning: loopWarn },
          ));
          agentResults['debugger'] = dbgResult;
          loopDetector.extractFileEditsFromToolCalls(dbgResult.toolCalls);
          this.saveHistory(historyDir, `debug_checks_attempt_${attempt}.json`, dbgResult);
          continue;
        }
      }

      // Code Review
      this.store.updateTaskStatus(task.id, 'reviewing', 'code_reviewer');
      this.callbacks.onAgentStart?.(task.id, 'code_reviewer');
      const reviewResult = await this.runAgent('code_reviewer', buildCodeReviewPrompt(
        task, plan, diff, gitDiff,
        { checkResults: checkResultsText },
      ));
      agentResults['code_reviewer'] = reviewResult;
      this.callbacks.onAgentComplete?.(task.id, 'code_reviewer', reviewResult);
      this.saveHistory(historyDir, 'code_review.json', reviewResult);
      this.store.addVerdict(task.id, 'code_reviewer', reviewResult.verdict ?? 'FAIL', reviewResult.verdictReason);

      if (reviewResult.verdict === 'FAIL') {
        // Debug and retry
        this.store.updateTaskStatus(task.id, 'debugging', 'debugger');
        const loopWarn = isLooping
          ? (loopDetector.getWarning() ?? undefined)
          : undefined;
        const dbgResult = await this.runAgent('debugger', buildDebuggerPrompt(
          task, plan, diff, reviewResult.output,
          { lessons: relevantLessons, loopWarning: loopWarn },
        ));
        agentResults['debugger'] = dbgResult;
        loopDetector.extractFileEditsFromToolCalls(dbgResult.toolCalls);
        this.saveHistory(historyDir, `debug_attempt_${attempt}.json`, dbgResult);

        // Extract lesson from debug cycle
        this.extractAndSaveLesson(task.id, 'code_reviewer', reviewResult, dbgResult);

        continue;
      }

      // Security Review (non-blocking)
      this.store.updateTaskStatus(task.id, 'reviewing', 'security_reviewer');
      this.callbacks.onAgentStart?.(task.id, 'security_reviewer');
      try {
        const secResult = await this.runAgent('security_reviewer', buildSecurityReviewPrompt(diff, gitDiff));
        agentResults['security_reviewer'] = secResult;
        this.callbacks.onAgentComplete?.(task.id, 'security_reviewer', secResult);
        this.saveHistory(historyDir, 'security_review.json', secResult);
        if (secResult.verdict === 'FAIL') {
          securityWarnings.push(secResult.verdictReason);
        }
      } catch {
        securityWarnings.push('Security reviewer failed to execute');
      }

      // QA Testing
      this.store.updateTaskStatus(task.id, 'qa_testing', 'qa_engineer');
      this.callbacks.onAgentStart?.(task.id, 'qa_engineer');
      const qaResult = await this.runAgent('qa_engineer', buildQAPrompt(task, plan, diff));
      agentResults['qa_engineer'] = qaResult;
      this.callbacks.onAgentComplete?.(task.id, 'qa_engineer', qaResult);
      this.saveHistory(historyDir, 'qa.json', qaResult);
      this.store.addVerdict(task.id, 'qa_engineer', qaResult.verdict ?? 'FAIL', qaResult.verdictReason);

      if (qaResult.verdict === 'FAIL') {
        this.store.updateTaskStatus(task.id, 'debugging', 'debugger');
        const loopWarn = loopDetector.getWarning() ?? undefined;
        const dbgResult = await this.runAgent('debugger', buildDebuggerPrompt(
          task, plan, diff, qaResult.output,
          { lessons: relevantLessons, loopWarning: loopWarn },
        ));
        agentResults['debugger'] = dbgResult;
        loopDetector.extractFileEditsFromToolCalls(dbgResult.toolCalls);
        this.saveHistory(historyDir, `debug_qa_attempt_${attempt}.json`, dbgResult);

        // Extract lesson from QA debug cycle
        this.extractAndSaveLesson(task.id, 'qa_engineer', qaResult, dbgResult);

        continue;
      }

      // All passed — run exit protocol
      const exitReport = await this.runExitProtocol(workdir, task.id, historyDir);
      this.store.updateTaskStatus(task.id, 'done');

      const taskResult: TaskResult = { taskId: task.id, status: 'done', plan, agentResults, securityWarnings, attempts: attempt + 1, exitReport };
      this.saveHistory(historyDir, 'summary.json', taskResult);
      this.callbacks.onTaskComplete?.(taskResult);
      return taskResult;
    }

    // Exceeded retries — run exit protocol even on failure
    const exitReport = await this.runExitProtocol(workdir, task.id, historyDir);
    this.store.updateTaskStatus(task.id, 'failed');
    const taskResult: TaskResult = {
      taskId: task.id, status: 'failed', plan, agentResults, securityWarnings,
      attempts: this.config.pipeline.max_retry + 1, exitReport,
    };
    this.saveHistory(historyDir, 'summary.json', taskResult);
    this.callbacks.onTaskComplete?.(taskResult);
    return taskResult;
  }

  private async runAgent(role: string, prompt: string): Promise<AgentResult> {
    const runConfig = buildAgentRunConfig(role as AgentRole, this.config);
    const result = await executeAgent(runConfig, prompt);
    this.store.recordAgentRun(role, result.numTurns, result.costUsd, result.durationMs);
    return result;
  }

  private saveHistory(dir: string, filename: string, data: unknown): void {
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2), 'utf-8');
  }

  private gitCheckpoint(workdir: string, taskId: string, attempt: number, changedFiles: string[]): void {
    try {
      const fileArgs = changedFiles.map((f) => `"${f}"`).join(' ');
      execSync(`git add ${fileArgs}`, { cwd: workdir, timeout: 10_000 });
      execSync(
        `git commit -m "harness: checkpoint ${taskId} attempt ${attempt}"`,
        { cwd: workdir, timeout: 10_000 },
      );
    } catch {
      // Non-fatal: checkpoint failure should not break the pipeline
    }
  }

  private extractAndSaveLesson(
    taskId: string,
    agent: string,
    reviewResult: AgentResult,
    debugResult: AgentResult,
  ): void {
    try {
      const pattern = reviewResult.verdictReason || reviewResult.output.slice(0, 200);
      const fix = debugResult.output.slice(0, 200);
      this.lessonStore.addLesson({
        taskId,
        agent,
        pattern,
        fix,
        timestamp: new Date().toISOString(),
      });
      this.lessonStore.save(this.config.lessons_file);
    } catch {
      // Non-fatal: lesson extraction failure should not break the pipeline
    }
  }

  /**
   * Exit protocol: runs after every task (pass or fail) to ensure clean state.
   * 1. Run deterministic checks one final time
   * 2. Save progress summary
   * 3. Git checkpoint if enabled
   */
  private async runExitProtocol(
    workdir: string,
    taskId: string,
    historyDir: string,
  ): Promise<string> {
    const lines: string[] = [`Exit Protocol — Task ${taskId}`];

    // 1. Final deterministic checks
    const { checks } = this.config.pipeline;
    if (checks.enabled && checks.commands.length > 0) {
      const results = await runDeterministicChecks(workdir, checks.commands);
      const allPassed = results.every((r) => r.passed);
      lines.push(`\nFinal checks: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'}`);
      for (const r of results) {
        lines.push(`  ${r.passed ? 'PASS' : 'FAIL'}: ${r.command}`);
        if (!r.passed) {
          lines.push(`    ${r.output.slice(0, 200)}`);
        }
      }
    }

    // 2. Progress summary
    const taskState = this.store.getTask(taskId);
    if (taskState) {
      lines.push(`\nProgress:`);
      lines.push(`  Status: ${taskState.status}`);
      lines.push(`  Attempts: ${taskState.attempt}`);
      lines.push(`  Verdicts: ${taskState.verdict_history.map((v) => `${v.agent}:${v.verdict}`).join(', ') || 'none'}`);
    }

    // 3. Final git checkpoint
    if (this.config.pipeline.auto_commit) {
      try {
        execSync('git add -A', { cwd: workdir, timeout: 10_000 });
        execSync(
          `git commit -m "harness: final ${taskId}" --allow-empty`,
          { cwd: workdir, timeout: 10_000 },
        );
        lines.push('\nGit: final checkpoint committed');
      } catch {
        lines.push('\nGit: no changes to commit');
      }
    }

    const report = lines.join('\n');
    this.saveHistory(historyDir, 'exit_protocol.txt', report);
    return report;
  }
}
