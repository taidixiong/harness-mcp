import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';

export function registerFeatureCommand(program: Command, templatesDir: string): void {
  program
    .command('feature <name>')
    .description('创建需求目录 docs/features/<name>/（含结构化模板）')
    .action((name: string) => {
      const featureDir = path.join('docs', 'features', name);

      if (fs.existsSync(featureDir)) {
        console.error(`Feature directory already exists: ${featureDir}`);
        process.exit(1);
      }

      fs.mkdirSync(featureDir, { recursive: true });

      const featureTemplatesDir = path.join(templatesDir, 'feature');
      const templates = ['requirement.md', 'checklist.md', 'feature-list.json'];

      for (const tmpl of templates) {
        const src = path.join(featureTemplatesDir, tmpl);
        if (fs.existsSync(src)) {
          let content = fs.readFileSync(src, 'utf-8');
          content = content.replace(/\[FEATURE_NAME\]/g, name);
          content = content.replace(/"feature_name": ""/, `"feature_name": "${name}"`);
          content = content.replace(/"created_at": ""/, `"created_at": "${new Date().toISOString().slice(0, 10)}"`);
          fs.writeFileSync(path.join(featureDir, tmpl), content, 'utf-8');
        }
      }

      // Create empty progress.md
      fs.writeFileSync(
        path.join(featureDir, 'progress.md'),
        `# Progress: ${name}\n\n> Agent 在每个子任务完成后更新此文件。\n\n## Timeline\n\n_(empty)_\n`,
        'utf-8',
      );

      console.log(`Created feature directory: ${featureDir}/`);
      console.log('  requirement.md   — 填写需求规格（背景、用户故事、验收标准）');
      console.log('  feature-list.json — 定义子任务清单');
      console.log('  checklist.md     — 完成标准清单');
      console.log('  progress.md      — Agent 进度记录');
      console.log('\nNext steps:');
      console.log('  1. Fill in requirement.md with your requirements');
      console.log('  2. Define subtasks in feature-list.json');
      console.log(`  3. harness plan docs/features/${name}/requirement.md`);
      console.log('  4. harness run');
    });
}
