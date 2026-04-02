import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config/loader.js';
import { LessonStore } from '../state/lessons.js';

export function registerLessonsCommand(program: Command): void {
  const lessonsCmd = program
    .command('lessons')
    .description('查看和管理跨需求的经验教训（lessons）');

  lessonsCmd
    .command('list')
    .alias('ls')
    .description('列出所有 lessons')
    .option('--agent <name>', '按 agent 过滤 (code_reviewer / qa_engineer / debugger)')
    .option('--task <id>', '按任务 ID 过滤')
    .action((opts: { agent?: string; task?: string }) => {
      const config = loadConfig('harness.yaml');
      const store = new LessonStore();
      store.load(config.lessons_file);
      let lessons = [...store.getAll()];

      if (opts.agent) lessons = lessons.filter((l) => l.agent === opts.agent);
      if (opts.task) lessons = lessons.filter((l) => l.taskId === opts.task);

      if (lessons.length === 0) {
        console.log('No lessons found.');
        return;
      }

      console.log(`Found ${lessons.length} lesson(s):\n`);
      lessons.forEach((l, i) => {
        const date = l.timestamp.slice(0, 10);
        console.log(`  #${i + 1}  [${l.taskId}] ${l.agent}  (${date})`);
        console.log(`      Pattern: ${l.pattern.slice(0, 80)}${l.pattern.length > 80 ? '...' : ''}`);
        console.log(`      Fix:     ${l.fix.slice(0, 80)}${l.fix.length > 80 ? '...' : ''}`);
        console.log('');
      });
    });

  lessonsCmd
    .command('show <index>')
    .description('查看某条 lesson 的完整内容（index 从 1 开始）')
    .action((index: string) => {
      const config = loadConfig('harness.yaml');
      const store = new LessonStore();
      store.load(config.lessons_file);
      const lessons = store.getAll();

      const i = parseInt(index, 10) - 1;
      if (isNaN(i) || i < 0 || i >= lessons.length) {
        console.error(`Invalid index. Valid range: 1-${lessons.length}`);
        process.exit(1);
      }

      const l = lessons[i];
      console.log(`Lesson #${i + 1}`);
      console.log(`  Task:      ${l.taskId}`);
      console.log(`  Agent:     ${l.agent}`);
      console.log(`  Timestamp: ${l.timestamp}`);
      console.log(`  Pattern:\n${indent(l.pattern)}`);
      console.log(`  Fix:\n${indent(l.fix)}`);
    });

  lessonsCmd
    .command('remove <indices...>')
    .alias('rm')
    .description('删除指定 lessons（index 从 1 开始，支持多个：harness lessons rm 1 3 5）')
    .action((indices: string[]) => {
      const config = loadConfig('harness.yaml');
      const store = new LessonStore();
      store.load(config.lessons_file);
      const all = [...store.getAll()];

      const toRemove = new Set(
        indices.map((s) => parseInt(s, 10) - 1).filter((n) => !isNaN(n) && n >= 0 && n < all.length),
      );

      if (toRemove.size === 0) {
        console.error(`Invalid indices. Valid range: 1-${all.length}`);
        process.exit(1);
      }

      store.clear();
      all.forEach((l, i) => {
        if (!toRemove.has(i)) store.addLesson(l);
      });
      store.save(config.lessons_file);
      console.log(`Removed ${toRemove.size} lesson(s). ${all.length - toRemove.size} remaining.`);
    });

  lessonsCmd
    .command('clear')
    .description('清空所有 lessons')
    .action(() => {
      const config = loadConfig('harness.yaml');
      const store = new LessonStore();
      store.load(config.lessons_file);
      const count = store.getAll().length;

      if (count === 0) {
        console.log('No lessons to clear.');
        return;
      }

      store.clear();
      store.save(config.lessons_file);
      console.log(`Cleared ${count} lesson(s).`);
    });
}

function indent(text: string, prefix = '    '): string {
  return text.split('\n').map((line) => `${prefix}${line}`).join('\n');
}
