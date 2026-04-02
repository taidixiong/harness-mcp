import type { SnapshotDiff } from './snapshot.js';
import type { WorkspaceContext } from './context.js';
import type { Lesson } from '../state/lessons.js';
import { formatContextSection } from './context.js';
import { formatLessonsSection } from '../state/lessons.js';

interface TaskInfo {
  id: string;
  name: string;
  description: string;
}

interface PromptOptions {
  context?: WorkspaceContext;
  lessons?: readonly Lesson[];
  loopWarning?: string;
  checkResults?: string;
}

export function buildPlannerPrompt(
  task: TaskInfo,
  options: PromptOptions = {},
): string {
  const sections: string[] = [];

  sections.push(`You are planning the implementation of a task.

## Task
- ID: ${task.id}
- Name: ${task.name}
- Description: ${task.description}`);

  if (options.context) {
    sections.push(formatContextSection(options.context));
  }

  if (options.lessons && options.lessons.length > 0) {
    sections.push(formatLessonsSection(options.lessons));
  }

  sections.push(`## Instructions
1. Read the relevant codebase to understand the current architecture
2. Break the task into concrete implementation steps
3. Identify files to create or modify
4. Define acceptance criteria

## Output Format
Respond with a structured plan in this JSON format:
\`\`\`json
{
  "steps": [
    { "order": 1, "description": "...", "files": ["path/to/file.ts"] }
  ],
  "acceptance_criteria": ["criterion 1", "criterion 2"],
  "risks": ["risk 1"]
}
\`\`\``);

  return sections.join('\n\n');
}

export function buildGeneratorPrompt(
  task: TaskInfo,
  plan: string,
  debugFeedback?: string,
  options: PromptOptions = {},
): string {
  const sections: string[] = [];

  sections.push(`You are implementing a task according to a plan.

## Task
- ID: ${task.id}
- Name: ${task.name}
- Description: ${task.description}

## Plan
${plan}

## Instructions
- Implement the code changes described in the plan
- Write tests for new functionality
- Ensure the code builds and tests pass
- Follow existing code conventions in the project`);

  if (options.context) {
    sections.push(formatContextSection(options.context));
  }

  if (options.lessons && options.lessons.length > 0) {
    sections.push(formatLessonsSection(options.lessons));
  }

  if (options.loopWarning) {
    sections.push(options.loopWarning);
  }

  if (debugFeedback) {
    sections.push(`## Previous Attempt Failed
The previous implementation had issues. Here is the feedback:
${debugFeedback}

Fix these issues while maintaining the original plan.`);
  }

  return sections.join('\n\n');
}

export function buildCodeReviewPrompt(
  task: TaskInfo,
  plan: string,
  diff: SnapshotDiff,
  gitDiff: string,
  options: PromptOptions = {},
): string {
  const sections: string[] = [];

  sections.push(`You are reviewing code changes for a task.

## Task
- ID: ${task.id}
- Name: ${task.name}

## Plan
${plan}

## Changed Files
- Added: ${diff.added.join(', ') || 'none'}
- Modified: ${diff.modified.join(', ') || 'none'}
- Deleted: ${diff.deleted.join(', ') || 'none'}

## Diff
\`\`\`diff
${gitDiff}
\`\`\``);

  if (options.checkResults) {
    sections.push(options.checkResults);
  }

  sections.push(`## Review Checklist
1. Code correctness - does it implement the plan?
2. Error handling - are edge cases covered?
3. Code style - consistent with existing codebase?
4. Architecture - proper separation of concerns?
5. Tests - adequate coverage?

## Required Output
End your review with exactly one of:
- VERDICT: PASS (if all checks pass)
- VERDICT: FAIL (if any critical issue found)

If FAIL, explain: what file, what issue, and why.`);

  return sections.join('\n\n');
}

export function buildSecurityReviewPrompt(
  diff: SnapshotDiff,
  gitDiff: string,
): string {
  return `You are performing a security review on code changes.

## Changed Files
- Added: ${diff.added.join(', ') || 'none'}
- Modified: ${diff.modified.join(', ') || 'none'}

## Diff
\`\`\`diff
${gitDiff}
\`\`\`

## Security Checklist (OWASP Top 10)
1. Injection (SQL, command, LDAP)
2. Broken authentication
3. Sensitive data exposure (hardcoded secrets, API keys)
4. XXE / XML external entities
5. Broken access control
6. Security misconfiguration
7. XSS
8. Insecure deserialization
9. Using components with known vulnerabilities
10. Insufficient logging

## Required Output
End your review with exactly one of:
- VERDICT: PASS
- VERDICT: FAIL

If FAIL, specify: file path, line, vulnerability type, and remediation.
`;
}

export function buildQAPrompt(
  task: TaskInfo,
  plan: string,
  diff: SnapshotDiff,
): string {
  return `You are a QA engineer verifying a completed task.

## Task
- ID: ${task.id}
- Name: ${task.name}
- Description: ${task.description}

## Plan
${plan}

## Changed Files
- Added: ${diff.added.join(', ') || 'none'}
- Modified: ${diff.modified.join(', ') || 'none'}

## Instructions
1. Read the changed files
2. Run the build command to verify compilation
3. Run the test suite
4. Verify each acceptance criterion from the plan
5. Check for regressions

## Required Output
End your verification with exactly one of:
- VERDICT: PASS (all criteria met, tests pass)
- VERDICT: FAIL (with specific failure details: file, expected vs actual, root cause)
`;
}

export function buildDebuggerPrompt(
  task: TaskInfo,
  plan: string,
  diff: SnapshotDiff,
  failureFeedback: string,
  options: PromptOptions = {},
): string {
  const sections: string[] = [];

  sections.push(`You are debugging a failed code review or QA check.

## Task
- ID: ${task.id}
- Name: ${task.name}

## Plan
${plan}

## Changed Files
- Added: ${diff.added.join(', ') || 'none'}
- Modified: ${diff.modified.join(', ') || 'none'}

## Failure Report
${failureFeedback}

## Instructions
- Make MINIMAL fixes to address the reported issues
- Do NOT refactor or add features beyond the fix
- Ensure the build passes after your changes
- Run relevant tests to verify the fix`);

  if (options.lessons && options.lessons.length > 0) {
    sections.push(formatLessonsSection(options.lessons));
  }

  if (options.loopWarning) {
    sections.push(options.loopWarning);
  }

  return sections.join('\n\n');
}
