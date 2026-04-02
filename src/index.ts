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
import type { PipelineCallbacks } from './pipeline/types.js';
import { App } from './tui/App.js';
import { registerPlanCommand, registerNewCommand } from './cli/plan.js';
import { registerLessonsCommand } from './cli/lessons.js';
import { registerFeatureCommand } from './cli/feature.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(__dirname, '..', 'templates');

const program = new Command();

program
  .name('harness')
  .description('Claude Code 多智能体编排工具')
  .version('0.1.0')
  .addHelpText('after', `
什么是 harness:
  harness 是 Claude Code 的多智能体编排工具。Claude Code 自身不具备流水线编排、
  VERDICT 重试、状态持久化等能力。harness 将多个 "claude -p" 子进程串成一条自动化
  流水线: planner -> generator -> code_reviewer -> security_reviewer -> qa_engineer，
  失败时自动触发 debugger 修复并重试。

注入到已有项目:
  只需改 2 个文件，不需要修改任何项目代码:

  1. harness.yaml — 改项目名:
       project:
         name: "your-project-name"
         workdir: "."

     Agent 配置和 pipeline 参数一般用默认值即可，有特殊需求再改。

  2. tasks.yaml — 写你的需求 (description 越详细，Agent 执行质量越高):
       tasks:
         - id: "T001"
           name: "添加用户登录"
           description: |
             实现基于 JWT 的用户登录接口，包括:
             - POST /api/login 接收 email+password
             - POST /api/register 注册新用户
             - 密码用 bcrypt 加密，返回 access_token
           priority: high

快速开始:
  $ cd your-project
  $ harness init             生成 harness.yaml、tasks.yaml、.harness/
  $ vim tasks.yaml           定义你的需求
  $ harness run              运行全部任务
  $ harness run -t T001      只运行指定任务
  $ harness run --no-tui     纯日志模式（无 TUI）
  $ harness resume           中断后恢复（Ctrl+C 后）
  $ harness status           查看任务进度和费用
  $ harness report T001      查看某个任务的执行报告

从需求文档生成 tasks.yaml:
  $ harness plan PRD.md                   从需求文档自动生成 tasks.yaml
  $ harness plan design.md -m opus        用 opus 模型生成（更精准）
  $ harness plan spec.txt --dry-run       预览输出，不写文件
  $ harness plan req.md -o tasks2.yaml    输出到自定义文件

  支持的文档格式: .md, .txt, .doc 等任何纯文本格式。
  文档内容越详细，生成的任务拆分越准确。

切换需求 (A 做完了开始 B):
  $ harness new                    归档旧状态，手动编辑 tasks.yaml
  $ harness new B-requirements.md  归档旧状态 + 自动从文档生成新 tasks
  $ harness run                    开始执行

  harness new 会把旧的 state/history/tasks 归档到 .harness/archive/，
  但保留 lessons.json（跨需求的经验学习不丢失）。

结构化需求管理:
  $ harness feature F001-user-auth     创建需求目录（含模板）
  $ vim docs/features/F001-user-auth/requirement.md  填写需求
  $ harness plan docs/features/F001-user-auth/requirement.md
  $ harness run

  模板文件说明:
    requirement.md     需求规格（背景、用户故事、验收标准）
    feature-list.json  子任务清单（ID、名称、状态）
    checklist.md       完成标准（构建、测试、安全、需求验证）
    progress.md        Agent 进度记录（自动更新）

经验管理 (lessons):
  $ harness lessons ls                 列出所有经验
  $ harness lessons ls --agent code_reviewer  按 agent 过滤
  $ harness lessons show 3             查看第 3 条完整内容
  $ harness lessons rm 1 3 5           删除低质量条目
  $ harness lessons clear              清空全部

  lessons 在 debug 修复成功后自动提取，跨需求持久化。
  团队项目建议 git 提交 .harness/lessons.json 共享经验。

确定性检查 (checks):
  在 harness.yaml 中配置 pipeline.checks，代码审查前先跑命令:

    pipeline:
      checks:
        enabled: true
        commands:
          - "npm run build"
          - "npm test"
          - "npx tsc --noEmit"

  检查失败直接进入 debugger，跳过 AI 审查节省 token。

流水线流程:
  每个任务依次经过 6 个 Agent，失败自动重试:

  planner --> generator --> code_reviewer --> security_reviewer --> qa_engineer
                  ^               |                                     |
                  |             FAIL                                   FAIL
                  +--------- debugger <---------------------------------+
                         (最多重试 max_retry 次)

Agent 说明:
  planner           分析代码库，生成实施计划                    (opus)
  generator         逐步生成代码变更                            (sonnet)
  code_reviewer     代码审查，输出 VERDICT: PASS/FAIL           (opus)
  security_reviewer OWASP Top 10 安全审计                       (opus)
  qa_engineer       运行构建/测试，验证验收标准                 (sonnet)
  debugger          针对失败进行最小化修复                      (sonnet)

运行时产物 (.harness/):
  state.json                 全局状态（任务进度、费用统计）
  lessons.json               跨需求经验学习（可 git 提交共享）
  history/<taskId>/
    plan.json                规划输出
    generator.json           代码生成输出
    code_review.json         代码审查结果
    security_review.json     安全审查结果
    qa.json                  QA 测试结果
    exit_protocol.txt        退出协议（最终检查结果）
    summary.json             任务最终汇总

前置条件:
  - 已安装并登录 claude CLI（Agent 底层调用 "claude -p" 子进程）
  - 项目目录必须是 git 仓库（快照 diff 依赖 git）`);

// --- Register modular commands ---

registerPlanCommand(program);
registerNewCommand(program);
registerLessonsCommand(program);
registerFeatureCommand(program, templatesDir);

// --- help subcommand (direct output, no AI) ---

program
  .command('help')
  .description('显示使用流程速查')
  .action(() => {
    console.log(`
什么是 Harness
══════════════
Claude Code 多智能体编排工具。将多个 "claude -p" 子进程串成自动化流水线：

  planner → generator → code_reviewer → security_reviewer → qa_engineer
                  ^            |                                    |
                  |          FAIL                                 FAIL
                  +------- debugger <-------------------------------+
                       (自动重试 max_retry 次)

快速开始
════════
  $ cd your-project
  $ harness init                          # 1. 生成 harness.yaml + tasks.yaml + .harness/
  $ vim tasks.yaml                        # 2. 定义任务（或用 plan 自动生成）
  $ harness run                           # 3. 运行流水线

完整工作流
══════════
  ┌─────────────────────────────────────────────────────────┐
  │ 第一步: 初始化                                           │
  │   harness init                                          │
  │   修改 harness.yaml 中的 project.name                    │
  ├─────────────────────────────────────────────────────────┤
  │ 第二步: 定义任务 (二选一)                                 │
  │   方式 A: 手写 tasks.yaml                                │
  │   方式 B: harness plan PRD.md  ← 从文档自动生成          │
  ├─────────────────────────────────────────────────────────┤
  │ 第三步: 运行                                             │
  │   harness run                  全部任务                  │
  │   harness run -t T001          单个任务                  │
  │   harness run --no-tui         纯日志模式                │
  ├─────────────────────────────────────────────────────────┤
  │ 第四步: 监控                                             │
  │   harness status               查看进度和费用             │
  │   harness report T001          查看任务执行报告           │
  │   harness resume               中断后恢复 (Ctrl+C)       │
  ├─────────────────────────────────────────────────────────┤
  │ 第五步: 切换需求                                         │
  │   harness new                  归档旧状态，手动写新任务    │
  │   harness new B-req.md         归档 + 自动生成新任务      │
  └─────────────────────────────────────────────────────────┘

命令速查
════════
  harness init                  初始化项目 (生成配置和目录)
  harness plan <doc>            从需求文档生成 tasks.yaml
  harness run [-t ID] [--no-tui] 运行 Agent 流水线
  harness resume                恢复中断的运行
  harness status                查看任务进度和费用
  harness report <taskId>       查看任务执行报告
  harness new [doc]             切换新需求 (归档旧状态)
  harness feature <name>        创建结构化需求目录
  harness lessons ls            列出所有经验
  harness lessons show <n>      查看第 n 条经验
  harness lessons rm <n...>     删除指定经验
  harness help                  显示本帮助

结构化需求管理
══════════════
  $ harness feature F001-user-auth                              # 创建需求目录
  $ vim docs/features/F001-user-auth/requirement.md             # 填写需求
  $ harness plan docs/features/F001-user-auth/requirement.md    # 生成任务
  $ harness run                                                 # 执行

  docs/features/F001-user-auth/
  ├── requirement.md       需求规格 (背景、用户故事、验收标准)
  ├── feature-list.json    子任务清单 (ID、名称、状态)
  ├── checklist.md         完成标准 (构建、测试、安全)
  └── progress.md          Agent 进度记录 (自动更新)

确定性检查
══════════
  在 harness.yaml 中配置，代码审查前自动运行：

    pipeline:
      checks:
        enabled: true
        commands:
          - "npm run build"
          - "npm test"
          - "npx tsc --noEmit"

  检查失败 → 直接进 debugger 修复，跳过 AI 审查，节省 token。

运行时产物
══════════
  .harness/
  ├── state.json                任务进度、费用统计
  ├── lessons.json              跨需求经验 (建议 git 提交共享)
  ├── history/<taskId>/
  │   ├── plan.json             规划输出
  │   ├── generator.json        代码生成输出
  │   ├── code_review.json      代码审查结果
  │   ├── security_review.json  安全审查结果
  │   ├── qa.json               QA 测试结果
  │   ├── exit_protocol.txt     退出协议
  │   └── summary.json          任务汇总
  └── archive/<timestamp>/      harness new 归档的旧状态

前置条件
════════
  - 已安装并登录 claude CLI
  - 项目目录是 git 仓库
`);
  });

// --- Built-in commands ---

program
  .command('init')
  .description('在当前目录初始化 harness.yaml、tasks.yaml 和 .harness/')
  .action(() => {
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
  .description('运行 Agent 流水线 (planner -> generator -> reviewer -> QA)')
  .option('-t, --task <id>', '只运行指定任务 (如 T001)')
  .option('--no-tui', '禁用 TUI，使用纯日志输出')
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

    const isTui = opts.tui !== false;
    let inkInstance: ReturnType<typeof render> | null = null;

    if (isTui) {
      process.stdout.write('\x1b[?1049h');
      inkInstance = render(
        React.createElement(App, {
          store,
          projectName: config.project.name,
          pipelineStatus: 'running' as const,
        }),
        { patchConsole: true }
      );
    }

    const callbacks: PipelineCallbacks = isTui
      ? {}
      : {
          onTaskStart: (taskId) => console.log(`[pipeline] Starting task ${taskId}`),
          onAgentStart: (taskId, agent) => console.log(`[pipeline] ${agent} starting for ${taskId}`),
          onAgentComplete: (taskId, agent, result) => {
            console.log(`[pipeline] ${agent} complete for ${taskId} (verdict: ${result.verdict ?? 'N/A'})`);
          },
          onTaskComplete: (result) => {
            console.log(`[pipeline] Task ${result.taskId} ${result.status} (${result.attempts} attempts)`);
          },
        };

    const runner = new PipelineRunner(config, store, callbacks);
    const saveInterval = setInterval(() => store.saveTo(config.state_file), 30000);

    process.on('SIGINT', () => {
      runner.abort();
      store.saveTo(config.state_file);
      clearInterval(saveInterval);
      inkInstance?.unmount();
      if (isTui) process.stdout.write('\x1b[?1049l');
      process.exit(0);
    });

    try {
      await runner.runAll(tasks);
    } catch (err) {
      console.error('Pipeline error:', err);
    } finally {
      store.saveTo(config.state_file);
      clearInterval(saveInterval);
      if (inkInstance) {
        setTimeout(() => {
          inkInstance?.unmount();
          process.stdout.write('\x1b[?1049l');
          process.exit(0);
        }, 3000);
      }
    }
  });

program
  .command('resume')
  .description('恢复上次中断的任务（跳过已完成/失败的任务）')
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
  .description('查看任务进度、Agent 结果和总费用')
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
  .description('查看任务的详细执行报告（规划、审查、QA）')
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
