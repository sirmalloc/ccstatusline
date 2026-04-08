import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const SESSIONS_DIR = join(homedir(), '.cache', 'ccstatusline', 'sessions');

/**
 * Finds the Claude Code CLI PID by walking up the process tree.
 *
 * When Claude Code runs ccstatusline as a statusLine command, the process
 * tree looks like: claude → /bin/bash → node ccstatusline.js
 *
 * We walk up from our own parent to find the ancestor named "claude".
 * This PID matches what Claude's Bash tool sees as $PPID, making it
 * a reliable shared key for session discovery.
 */
function findClaudePid(): number | null {
    let pid = process.ppid;
    for (let i = 0; i < 10; i++) {
        try {
            const line = execSync(`ps -o ppid=,comm= -p ${pid}`, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            }).trim();
            const parts = line.split(/\s+/);
            const ppid = parseInt(parts[0] ?? '', 10);
            const comm = parts.slice(1).join(' ');
            if (comm === 'claude') {
                return pid;
            }
            if (isNaN(ppid) || ppid <= 1) break;
            pid = ppid;
        } catch {
            break;
        }
    }
    return null;
}

/**
 * Writes the session ID to a discovery file keyed by the Claude CLI PID.
 *
 * Problem: Claude Code doesn't expose session_id as an environment variable
 * or through any tool — it only appears in the JSON piped to statusLine
 * commands and hooks. But the task-objective widget needs Claude to write
 * task files keyed by session ID.
 *
 * Solution: ccstatusline receives session_id on every status line update.
 * We find the Claude CLI PID by walking the process tree, then write the
 * session ID to a file keyed by that PID. Claude discovers the file by
 * running `echo $PPID` (which returns the same Claude CLI PID) and reading
 * the corresponding file.
 */
export function writeSessionId(sessionId: string | undefined): void {
    if (!sessionId) return;

    const claudePid = findClaudePid();
    if (!claudePid) return;

    try {
        mkdirSync(SESSIONS_DIR, { recursive: true });
        writeFileSync(
            join(SESSIONS_DIR, String(claudePid)),
            sessionId,
            'utf8'
        );
    } catch {
        // Non-fatal — status line rendering should never fail due to this
    }
}
