import { execSync } from 'node:child_process';

const TASK_DECOMPOSITION_SYSTEM_PROMPT = `You are a task decomposition expert. Given a requirements document, break it down into independent, actionable tasks for a coding agent.

Rules:
1. Each task must be independently implementable
2. Task IDs follow the pattern T001, T002, T003...
3. Priority: high (core functionality), medium (enhancements), low (nice-to-have)
4. Description must be detailed enough for an AI agent to implement without asking questions
5. Include acceptance criteria in the description
6. Order tasks by dependency (earlier tasks should not depend on later ones)
7. Output ONLY valid YAML, no markdown fences, no explanation

Output format (strict YAML):
tasks:
  - id: "T001"
    name: "short task name"
    description: |
      Detailed description including:
      - What to implement
      - Expected behavior
      - Acceptance criteria
    priority: high`;

export function getTaskDecompositionSystemPrompt(): string {
  return TASK_DECOMPOSITION_SYSTEM_PROMPT;
}

export function buildTaskDecompositionPrompt(docContent: string): string {
  let dirTree = '';
  try {
    dirTree = execSync(
      'find . -maxdepth 3 -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" | head -80',
      { encoding: 'utf-8', timeout: 5000 },
    );
  } catch { /* ignore */ }

  return `Here is the requirements document to decompose into tasks:

---
${docContent}
---

${dirTree ? `Current project structure:\n\`\`\`\n${dirTree}\`\`\`\n` : ''}
Break this into independent, implementable tasks. Output ONLY the YAML content.`;
}
