import { createHash } from 'node:crypto';

const FILE_EDIT_THRESHOLD = 3;

export class LoopDetector {
  private readonly seenHashes = new Set<string>();
  private readonly fileEditCounts = new Map<string, number>();

  recordAttempt(taskId: string, output: string): boolean {
    const hash = createHash('sha256')
      .update(`${taskId}:${output}`)
      .digest('hex')
      .slice(0, 16);

    if (this.seenHashes.has(hash)) {
      return true;
    }
    this.seenHashes.add(hash);
    return false;
  }

  recordFileEdit(filePath: string): number {
    const count = (this.fileEditCounts.get(filePath) ?? 0) + 1;
    this.fileEditCounts.set(filePath, count);
    return count;
  }

  getWarning(): string | null {
    const repeatedFiles = Array.from(this.fileEditCounts.entries())
      .filter(([, count]) => count >= FILE_EDIT_THRESHOLD)
      .map(([file, count]) => `  - ${file} (${count} edits)`);

    if (repeatedFiles.length === 0) return null;

    return `## Loop Detection Warning
The following files have been edited ${FILE_EDIT_THRESHOLD}+ times, which suggests a repeating pattern:
${repeatedFiles.join('\n')}

IMPORTANT: You may be stuck in a loop. Consider a fundamentally different approach:
- Re-read the error messages carefully
- Check if your assumptions about the codebase are wrong
- Try a completely different implementation strategy
`;
  }

  extractFileEditsFromToolCalls(
    toolCalls: ReadonlyArray<{ name: string; input: Record<string, unknown> }>,
  ): void {
    for (const call of toolCalls) {
      if (call.name === 'Write' || call.name === 'Edit') {
        const filePath = call.input['file_path'] as string | undefined;
        if (filePath) {
          this.recordFileEdit(filePath);
        }
      }
    }
  }

  reset(): void {
    this.seenHashes.clear();
    this.fileEditCounts.clear();
  }
}
