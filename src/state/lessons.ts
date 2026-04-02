import fs from 'node:fs';
import path from 'node:path';

export interface Lesson {
  taskId: string;
  agent: string;
  pattern: string;
  fix: string;
  timestamp: string;
}

export class LessonStore {
  private lessons: Lesson[] = [];

  load(filePath: string): void {
    try {
      const resolved = path.resolve(filePath);
      if (fs.existsSync(resolved)) {
        const raw = fs.readFileSync(resolved, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.lessons = parsed as Lesson[];
        }
      }
    } catch {
      this.lessons = [];
    }
  }

  save(filePath: string): void {
    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, JSON.stringify(this.lessons, null, 2), 'utf-8');
  }

  addLesson(lesson: Lesson): void {
    this.lessons = [...this.lessons, lesson];
  }

  findRelevant(taskDescription: string, limit = 5): Lesson[] {
    const keywords = taskDescription
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2);

    if (keywords.length === 0) return [];

    const scored = this.lessons.map((lesson) => {
      const text = `${lesson.pattern} ${lesson.fix}`.toLowerCase();
      const score = keywords.reduce(
        (acc, kw) => acc + (text.includes(kw) ? 1 : 0),
        0,
      );
      return { lesson, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.lesson);
  }

  getAll(): readonly Lesson[] {
    return this.lessons;
  }

  clear(): void {
    this.lessons = [];
  }
}

export function formatLessonsSection(lessons: readonly Lesson[]): string {
  if (lessons.length === 0) return '';

  const items = lessons
    .map((l) => `- **Pattern:** ${l.pattern}\n  **Fix:** ${l.fix} _(from task ${l.taskId})_`)
    .join('\n');

  return `## Lessons from Previous Runs\n${items}\n`;
}
