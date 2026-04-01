#!/usr/bin/env node
import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config/loader.js';
import { loadTasks } from './tasks/loader.js';
import { HarnessStore } from './state/store.js';
import { PipelineRunner } from './pipeline/runner.js';
import { App } from './tui/App.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const program = new Command();

program
  .name('harness')
  .description('Multi-agent harness for Claude Code CLI')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize harness config and task files')
  .action(() => {
    const templatesDir = path.join(__dirname, '..', 'templates');
    const harnessTemplate = fs.readFileSync(path.join(templatesDir, 'harness.yaml'), 'utf-8');
    const tasksTemplate = fs.readFileSync(path.join(templatesDir, 'tasks.yaml'), 'utf-8');

    if (!fs.existsSync('harness.yaml')) {
      fs.writeFileSync('harness.yaml', harnessTemplate);
      console.log('Created harness.yaml');
    } else {
      console.log('harness.yaml already exists, skipping');
    }

    if (!fs.existsSync('tasks.yaml')) {
      fs.writeFileSync('tasks.yaml', tasksTemplate);
      console.log('Created tasks.yaml');
    } else {
      console.log('tasks.yaml already exists, skipping');
    }

    fs.mkdirSync('.harness', { recursive: true });
    console.log('Initialized .harness/ directory');
  });

program
  .command('run')
  .description('Run the pipeline')
  .option('-t, --task <id>', 'Run a specific task only')
  .option('--no-tui', 'Disable TUI, use plain log output')
  .action(async (opts) => {
    const config = loadConfig('harness.yaml');
    const tasksFile = loadTasks(config.tasks_file);
    const store = new HarnessStore(config.project.name);
    store.loadTasks(tasksFile.tasks);

    const tasks = opts.task
      ? tasksFile.tasks.filter((t) => t.id === opts.task)
      : tasksFile.tasks;

    if (tasks.length === 0) {
      console.error(`No tasks found${opts.task ? ` with id ${opts.task}` : ''}`);
      process.exit(1);
    }

    let pipelineStatus: 'idle' | 'running' | 'complete' | 'error' = 'running';
    let inkInstance: ReturnType<typeof render> | null = null;

    if (opts.tui !== false) {
      inkInstance = render(
        React.createElement(App, {
          store,
          projectName: config.project.name,
          pipelineStatus,
        })
      );
    }

    const runner = new PipelineRunner(config, store, {
      onTaskStart: (taskId) => console.log(`[pipeline] Starting task ${taskId}`),
      onAgentStart: (taskId, agent) => console.log(`[pipeline] ${agent} starting for ${taskId}`),
      onAgentComplete: (taskId, agent, result) => {
        console.log(`[pipeline] ${agent} complete for ${taskId} (verdict: ${result.verdict ?? 'N/A'})`);
      },
      onTaskComplete: (result) => {
        console.log(`[pipeline] Task ${result.taskId} ${result.status} (${result.attempts} attempts)`);
      },
    });

    // Auto-save state every 30 seconds
    const saveInterval = setInterval(() => store.saveTo(config.state_file), 30000);

    // Graceful shutdown
    process.on('SIGINT', () => {
      runner.abort();
      store.saveTo(config.state_file);
      clearInterval(saveInterval);
      inkInstance?.unmount();
      process.exit(0);
    });

    try {
      const results = await runner.runAll(tasks);
      pipelineStatus = results.every((r) => r.status === 'done') ? 'complete' : 'error';
    } catch (err) {
      pipelineStatus = 'error';
      console.error('Pipeline error:', err);
    } finally {
      store.saveTo(config.state_file);
      clearInterval(saveInterval);
      if (inkInstance) {
        // Keep TUI alive for a moment to show final state
        setTimeout(() => {
          inkInstance?.unmount();
          process.exit(0);
        }, 3000);
      }
    }
  });

program
  .command('resume')
  .description('Resume from last interruption')
  .action(async () => {
    const config = loadConfig('harness.yaml');
    if (!fs.existsSync(config.state_file)) {
      console.error('No state file found. Run `harness run` first.');
      process.exit(1);
    }
    const store = HarnessStore.loadFrom(config.state_file);
    const state = store.getState();
    const pending = state.tasks.filter((t) => !['done', 'failed'].includes(t.status));
    if (pending.length === 0) {
      console.log('All tasks are already done or failed.');
      return;
    }
    console.log(`Resuming ${pending.length} tasks...`);
    const tasksFile = loadTasks(config.tasks_file);
    const tasks = tasksFile.tasks.filter((t) => pending.some((p) => p.id === t.id));
    const runner = new PipelineRunner(config, store);
    await runner.runAll(tasks);
    store.saveTo(config.state_file);
  });

program
  .command('status')
  .description('Print current status')
  .action(() => {
    const config = loadConfig('harness.yaml');
    if (!fs.existsSync(config.state_file)) {
      console.log('No state file found. Run `harness run` first.');
      return;
    }
    const store = HarnessStore.loadFrom(config.state_file);
    const state = store.getState();
    console.log(`Project: ${state.project}`);
    console.log(`Tasks: ${state.tasks.length}`);
    for (const t of state.tasks) {
      const icon = t.status === 'done' ? 'V' : t.status === 'failed' ? 'X' : '-';
      console.log(`  ${icon} ${t.id} ${t.name} [${t.status}]`);
    }
    console.log(`Total cost: $${state.stats.total_cost_usd.toFixed(3)}`);
  });

program
  .command('report <taskId>')
  .description('Print execution report for a task')
  .action((taskId: string) => {
    const config = loadConfig('harness.yaml');
    const historyDir = path.join(path.dirname(config.state_file), 'history', taskId);
    if (!fs.existsSync(historyDir)) {
      console.error(`No history found for task ${taskId}`);
      process.exit(1);
    }
    const summaryPath = path.join(historyDir, 'summary.json');
    if (fs.existsSync(summaryPath)) {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log('Available files:');
      for (const f of fs.readdirSync(historyDir)) {
        console.log(`  ${f}`);
      }
    }
  });

program.parse();
