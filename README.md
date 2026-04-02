# Claude Harness

Claude Code multi-agent orchestration CLI. Chain multiple `claude -p` subprocesses into an automated pipeline with VERDICT-based retry, state persistence, and lesson learning.

## Pipeline

```
planner → generator → code_reviewer → security_reviewer → qa_engineer
               ^            |                                    |
               |          FAIL                                 FAIL
               +------- debugger <-------------------------------+
                    (auto-retry up to max_retry times)
```

| Agent | Model | Role |
|-------|-------|------|
| planner | opus | Analyze codebase, generate implementation plan |
| generator | sonnet | Incrementally generate code changes |
| code_reviewer | opus | Review for correctness, output VERDICT: PASS/FAIL |
| security_reviewer | opus | OWASP Top 10 security audit |
| qa_engineer | sonnet | Run builds/tests, verify acceptance criteria |
| debugger | sonnet | Minimal fix for failures |

## Prerequisites

- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- Node.js >= 18
- Project directory must be a git repository

## Install

```bash
git clone git@github.com:taidixiong/harness-mcp.git
cd harness-mcp
npm install
npm run build
npm link
```

## Quick Start

```bash
cd your-project

# 1. Initialize config and directory
harness init

# 2. Define tasks (edit tasks.yaml or generate from doc)
harness plan PRD.md

# 3. Run the pipeline
harness run
```

## Inject into Any Project

Only 2 files needed, no modifications to your project code:

**harness.yaml** — project config:
```yaml
project:
  name: "your-project-name"
  workdir: "."
```

**tasks.yaml** — task definitions (more detail = better agent output):
```yaml
tasks:
  - id: "T001"
    name: "Add user login"
    description: |
      Implement JWT-based login API:
      - POST /api/login accepts email+password
      - POST /api/register for new users
      - Passwords hashed with bcrypt, returns access_token
    priority: high
```

## Commands

| Command | Description |
|---------|-------------|
| `harness init` | Generate harness.yaml, tasks.yaml, .harness/ |
| `harness plan <doc>` | Generate tasks.yaml from requirement doc |
| `harness run [-t ID] [--no-tui]` | Run agent pipeline |
| `harness resume` | Resume interrupted run |
| `harness status` | View task progress and cost |
| `harness report <taskId>` | View task execution report |
| `harness new [doc]` | Switch to new requirement (archive old state) |
| `harness feature <name>` | Create structured requirement directory |
| `harness lessons ls` | List learned lessons |
| `harness lessons show <n>` | Show lesson detail |
| `harness lessons rm <n...>` | Remove lessons |
| `harness help` | Show usage reference |

## Deterministic Checks

Configure pre-review checks in harness.yaml to save tokens — failures go straight to debugger, skipping AI review:

```yaml
pipeline:
  checks:
    enabled: true
    commands:
      - "npm run build"
      - "npm test"
      - "npx tsc --noEmit"
```

## Structured Requirement Management

```bash
harness feature F001-user-auth          # Create requirement directory
vim docs/features/F001-user-auth/requirement.md  # Write spec
harness plan docs/features/F001-user-auth/requirement.md  # Generate tasks
harness run                             # Execute
```

Generated directory:
```
docs/features/F001-user-auth/
├── requirement.md       # Spec (background, user stories, acceptance criteria)
├── feature-list.json    # Sub-task list
├── checklist.md         # Completion checklist (build, test, security)
└── progress.md          # Agent progress (auto-updated)
```

## Lessons System

Debug fixes are automatically extracted as lessons and persist across requirements:

```bash
harness lessons ls                       # List all
harness lessons ls --agent code_reviewer # Filter by agent
harness lessons show 3                   # View detail
harness lessons rm 1 3 5                 # Remove low-quality entries
```

Commit `.harness/lessons.json` to git to share lessons across the team.

## Runtime Artifacts

```
.harness/
├── state.json                # Task progress, cost stats
├── lessons.json              # Cross-requirement lessons
├── history/<taskId>/
│   ├── plan.json             # Planning output
│   ├── generator.json        # Code generation output
│   ├── code_review.json      # Code review result
│   ├── security_review.json  # Security review result
│   ├── qa.json               # QA test result
│   ├── exit_protocol.txt     # Exit protocol
│   └── summary.json          # Task summary
└── archive/<timestamp>/      # Archived state from `harness new`
```

## Tech Stack

- **Language**: TypeScript (ES2022, NodeNext)
- **CLI**: Commander.js
- **TUI**: React + Ink
- **Validation**: Zod
- **Config**: YAML
- **Test**: Vitest

## License

MIT
