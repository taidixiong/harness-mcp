import type { Command } from 'commander';
import fs from 'node:fs';
import { loadConfig } from '../config/loader.js';
import { invokeClaude, cleanYamlOutput } from '../agents/invoke.js';
import { getTaskDecompositionSystemPrompt, buildTaskDecompositionPrompt } from './prompts.js';

export function registerPlanCommand(program: Command): void {
  program
    .command('plan <doc>')
    .description('从需求文档自动生成 tasks.yaml（用 Claude 拆分需求为独立任务）')
    .option('-o, --output <file>', '输出文件路径', 'tasks.yaml')
    .option('-m, --model <model>', '使用的模型', 'sonnet')
    .option('--dry-run', '只打印生成结果，不写文件')
    .action(async (doc: string, opts: { output: string; model: string; dryRun?: boolean }) => {
      if (!fs.existsSync(doc)) {
        console.error(`文件不存在: ${doc}`);
        process.exit(1);
      }

      const content = fs.readFileSync(doc, 'utf-8');
      console.log(`Reading: ${doc} (${content.length} chars)`);
      console.log(`Model: ${opts.model}`);
      console.log('Generating tasks...\n');

      const result = await invokeClaude({
        prompt: buildTaskDecompositionPrompt(content),
        systemPrompt: getTaskDecompositionSystemPrompt(),
        model: opts.model,
      });

      const yaml = cleanYamlOutput(result);

      if (opts.dryRun) {
        console.log(yaml);
        return;
      }

      if (!yaml.includes('tasks:') || !yaml.includes('id:')) {
        console.error('Generated output does not look like valid tasks YAML:');
        console.error(yaml);
        process.exit(1);
      }

      const outputPath = opts.output;
      if (fs.existsSync(outputPath)) {
        const backup = `${outputPath}.bak.${Date.now()}`;
        fs.copyFileSync(outputPath, backup);
        console.log(`Backed up existing ${outputPath} to ${backup}`);
      }

      fs.writeFileSync(outputPath, yaml, 'utf-8');
      console.log(`\nGenerated ${outputPath} successfully.`);
      console.log('Review the file, then run: harness run');
    });
}

export function registerNewCommand(program: Command): void {
  program
    .command('new [doc]')
    .description('开始新需求：归档旧状态，重置 state，可选从文档生成新 tasks.yaml')
    .option('-m, --model <model>', '生成 tasks 时使用的模型', 'sonnet')
    .action(async (doc: string | undefined, opts: { model: string }) => {
      const config = loadConfig('harness.yaml');
      const harnessDir = '.harness';

      // 1. Archive old state
      if (fs.existsSync(config.state_file)) {
        const archiveDir = `${harnessDir}/archive`;
        fs.mkdirSync(archiveDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const archiveName = `run-${timestamp}`;
        const archivePath = `${archiveDir}/${archiveName}`;
        fs.mkdirSync(archivePath, { recursive: true });

        fs.renameSync(config.state_file, `${archivePath}/state.json`);
        console.log(`Archived state.json -> archive/${archiveName}/`);

        const historyDir = `${harnessDir}/history`;
        if (fs.existsSync(historyDir)) {
          fs.renameSync(historyDir, `${archivePath}/history`);
          console.log(`Archived history/   -> archive/${archiveName}/`);
        }

        if (fs.existsSync(config.tasks_file)) {
          fs.copyFileSync(config.tasks_file, `${archivePath}/tasks.yaml`);
          console.log(`Copied   tasks.yaml -> archive/${archiveName}/`);
        }
      } else {
        console.log('No previous state to archive.');
      }

      // 2. Keep lessons
      if (fs.existsSync(config.lessons_file)) {
        try {
          const lessons = JSON.parse(fs.readFileSync(config.lessons_file, 'utf-8'));
          console.log(`Keeping lessons.json (${lessons.length} lessons carried forward)`);
        } catch {
          console.log('Keeping lessons.json');
        }
      }

      // 3. Generate new tasks from doc
      if (doc) {
        if (!fs.existsSync(doc)) {
          console.error(`文件不存在: ${doc}`);
          process.exit(1);
        }
        console.log(`\nGenerating tasks from: ${doc}`);

        const content = fs.readFileSync(doc, 'utf-8');
        const result = await invokeClaude({
          prompt: buildTaskDecompositionPrompt(content),
          systemPrompt: getTaskDecompositionSystemPrompt(),
          model: opts.model,
        });

        const yaml = cleanYamlOutput(result);
        if (!yaml.includes('tasks:') || !yaml.includes('id:')) {
          console.error('Generated output does not look like valid tasks YAML.');
          console.error(yaml);
          process.exit(1);
        }

        fs.writeFileSync(config.tasks_file, yaml, 'utf-8');
        console.log(`Generated new ${config.tasks_file}`);
      }

      console.log('\nReady for new requirement. Next steps:');
      if (!doc) {
        console.log(`  1. Edit ${config.tasks_file} with new tasks (or run: harness plan <doc>)`);
        console.log('  2. harness run');
      } else {
        console.log(`  1. Review ${config.tasks_file}`);
        console.log('  2. harness run');
      }
    });
}
