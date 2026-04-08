import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getClaudeConfigDir } from './claude-settings';

const CLAUDE_MD_MARKER_START = '<!-- ccstatusline:task-objective -->';
const CLAUDE_MD_MARKER_END = '<!-- /ccstatusline:task-objective -->';

function buildTaskInstructions(): string {
    const cacheDir = path.join(os.homedir(), '.cache', 'ccstatusline');
    const sessionsDir = path.join(cacheDir, 'sessions');
    const tasksDir = path.join(cacheDir, 'tasks');
    return `## Task Objective (ccstatusline)

When starting work, write a task file so the terminal status line shows what this session is doing. This helps the user distinguish between concurrent sessions.

**Step 1 — Discover your session ID** (once per session):
\`\`\`bash
echo $PPID
\`\`\`
Then use the Read tool to read \`${sessionsDir}/<PPID>\`. The file contains the session ID (written automatically by ccstatusline).

**Step 2 — Write the task file** using the Write tool (do not read the file first, just overwrite it):

Path: \`${tasksDir}/claude-task-<SESSION_ID>\`

\`\`\`json
{"task":"Brief description of current objective","status":"in_progress"}
\`\`\`

**Status values** (shown as emoji indicators in the status line):
| Status | Indicator | When to use |
|--------|-----------|-------------|
| \`in_progress\` | \u{1F504} | Actively working (default) |
| \`complete\` | \u2705 | Task finished successfully |
| \`failed\` | \u274C | Task failed |
| \`blocked\` | \u{1F6D1} | Waiting on user input or external dependency |
| \`paused\` | \u23F8\uFE0F | Work paused, will resume |
| \`reviewing\` | \u{1F50D} | Reviewing code or waiting for review |

**When to update:**
- At session start (set status to \`"in_progress"\`)
- When the objective changes significantly
- When work is complete (set status to \`"complete"\`)

Keep the task description concise — under 40 characters is ideal. Longer text will be truncated with an ellipsis in the status line.`;
}

function getClaudeMdPath(): string {
    return path.join(getClaudeConfigDir(), 'CLAUDE.md');
}

/**
 * Ensures the global CLAUDE.md contains task-objective instructions.
 * Uses marker comments so the section can be updated or removed cleanly.
 */
export function ensureTaskInstructions(): void {
    const mdPath = getClaudeMdPath();
    let content = '';

    try {
        content = fs.readFileSync(mdPath, 'utf8');
    } catch {
        // File doesn't exist yet
    }

    // Already present?
    if (content.includes(CLAUDE_MD_MARKER_START)) {
        // Replace existing section in case instructions were updated
        const regex = new RegExp(
            `${escapeRegex(CLAUDE_MD_MARKER_START)}[\\s\\S]*?${escapeRegex(CLAUDE_MD_MARKER_END)}`,
            'm'
        );
        content = content.replace(regex, buildSection());
    } else {
        // Append
        const separator = content.length > 0 && !content.endsWith('\n') ? '\n\n' : content.length > 0 ? '\n' : '';
        content = content + separator + buildSection() + '\n';
    }

    fs.mkdirSync(path.dirname(mdPath), { recursive: true });
    fs.writeFileSync(mdPath, content, 'utf8');
}

/**
 * Removes the task-objective instructions from CLAUDE.md.
 */
export function removeTaskInstructions(): void {
    const mdPath = getClaudeMdPath();

    let content: string;
    try {
        content = fs.readFileSync(mdPath, 'utf8');
    } catch {
        return; // Nothing to remove
    }

    if (!content.includes(CLAUDE_MD_MARKER_START)) {
        return;
    }

    const regex = new RegExp(
        `\\n?${escapeRegex(CLAUDE_MD_MARKER_START)}[\\s\\S]*?${escapeRegex(CLAUDE_MD_MARKER_END)}\\n?`,
        'm'
    );
    content = content.replace(regex, '\n');

    fs.writeFileSync(mdPath, content.trimEnd() + '\n', 'utf8');
}

function buildSection(): string {
    return `${CLAUDE_MD_MARKER_START}\n${buildTaskInstructions()}\n${CLAUDE_MD_MARKER_END}`;
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
