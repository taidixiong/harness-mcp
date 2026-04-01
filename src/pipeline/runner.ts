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
import { HarnessStore } from '../state/store.js';
import { eventBus } from '../state/events.js';
import fs from 'node:fs';
import path from 'node:path';

export class PipelineRunner {
  private config: HarnessConfig;
  private store: HarnessStore;
  private callbacks: PipelineCallbacks;
  private aborted = false;

  constructor(config: HarnessConfig, store: HarnessStore, callbacks: PipelineCallbacks = {}) {
    this.config = config;
    this.store = store;
    this.callbacks = callbacks;
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

    // 1. Planning
    this.store.updateTaskStatus(task.id, 'planning', 'planner');
    this.callbacks.onAgentStart?.(task.id, 'planner');
    const planResult = await this.runAgent('planner', buildPlannerPrompt(task));
    agentResults['planner'] = planResult;
    this.callbacks.onAgentComplete?.(task.id, 'planner', planResult);
    this.saveHistory(historyDir, 'plan.json', planResult);
    const plan = planResult.output;

    // 2. Generate → Review → QA loop
    for (let attempt = 0; attempt <= this.config.pipeline.max_retry; attempt++) {
      if (this.aborted) return { taskId: task.id, status: 'failed', plan, agentResults, securityWarnings, attempts: attempt };

      this.store.incrementAttempt(task.id);

      // Generate
      this.store.updateTaskStatus(task.id, 'generating', 'generator');
      this.callbacks.onAgentStart?.(task.id, 'generator');
      const snapshotBefore = this.config.pipeline.snapshot_enabled ? takeSnapshot(workdir) : [];
      const debugFeedback = attempt > 0 ? agentResults['debugger']?.output : undefined;
      const genResult = await this.runAgent('generator', buildGeneratorPrompt(task, plan, debugFeedback));
      agentResults['generator'] = genResult;
      this.callbacks.onAgentComplete?.(task.id, 'generator', genResult);
      this.saveHistory(historyDir, 'generator.json', genResult);

      const snapshotAfter = this.config.pipeline.snapshot_enabled ? takeSnapshot(workdir) : [];
      const diff = computeSnapshotDiff(snapshotBefore, snapshotAfter);
      const changedFiles = [...diff.added, ...diff.modified];
      const gitDiff = getGitDiff(workdir, changedFiles);

      this.saveHistory(historyDir, 'snapshot_before.json', snapshotBefore);
      this.saveHistory(historyDir, 'snapshot_after.json', snapshotAfter);

      // Code Review
      this.store.updateTaskStatus(task.id, 'reviewing', 'code_reviewer');
      this.callbacks.onAgentStart?.(task.id, 'code_reviewer');
      const reviewResult = await this.runAgent('code_reviewer', buildCodeReviewPrompt(task, plan, diff, gitDiff));
      agentResults['code_reviewer'] = reviewResult;
      this.callbacks.onAgentComplete?.(task.id, 'code_reviewer', reviewResult);
      this.saveHistory(historyDir, 'code_review.json', reviewResult);
      this.store.addVerdict(task.id, 'code_reviewer', reviewResult.verdict ?? 'FAIL', reviewResult.verdictReason);

      if (reviewResult.verdict === 'FAIL') {
        // Debug and retry
        this.store.updateTaskStatus(task.id, 'debugging', 'debugger');
        const dbgResult = await this.runAgent('debugger', buildDebuggerPrompt(task, plan, diff, reviewResult.output));
        agentResults['debugger'] = dbgResult;
        this.saveHistory(historyDir, `debug_attempt_${attempt}.json`, dbgResult);
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
        const dbgResult = await this.runAgent('debugger', buildDebuggerPrompt(task, plan, diff, qaResult.output));
        agentResults['debugger'] = dbgResult;
        this.saveHistory(historyDir, `debug_qa_attempt_${attempt}.json`, dbgResult);
        continue;
      }

      // All passed
      this.store.updateTaskStatus(task.id, 'done');

      const taskResult: TaskResult = { taskId: task.id, status: 'done', plan, agentResults, securityWarnings, attempts: attempt + 1 };
      this.saveHistory(historyDir, 'summary.json', taskResult);
      this.callbacks.onTaskComplete?.(taskResult);
      return taskResult;
    }

    // Exceeded retries
    this.store.updateTaskStatus(task.id, 'failed');
    const taskResult: TaskResult = {
      taskId: task.id, status: 'failed', plan, agentResults, securityWarnings,
      attempts: this.config.pipeline.max_retry + 1,
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
}
