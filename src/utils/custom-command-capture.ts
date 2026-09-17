import type { spawn } from 'child_process';

import type {
    CustomCommandRequest,
    CustomCommandResult
} from './custom-command';

/**
 * Runs in a separate runtime so the synchronous renderer can enforce a streaming
 * output limit. Keep this function self-contained: its compiled source is passed
 * to the current runtime with `-e`, including in the single-file release bundle.
 */
export function captureCustomCommand(
    spawnCommand: typeof spawn,
    request: CustomCommandRequest,
    maxBytes: number,
    maxChars: number
): void {
    const child = spawnCommand(request.command, {
        shell: true,
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true,
        detached: process.platform !== 'win32'
    });
    const output = Buffer.alloc(maxBytes);
    let length = 0;
    let finished = false;
    let exited = false;
    let exitMarker: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function finish(marker: string | null, terminate = false): void {
        if (finished) {
            return;
        }
        finished = true;
        clearTimeout(timer);

        if (terminate) {
            try {
                if (process.platform !== 'win32' && child.pid !== undefined) {
                    process.kill(-child.pid, 'SIGKILL');
                } else {
                    child.kill('SIGKILL');
                }
            } catch {
                // The command may already have exited.
            }
        }

        // Descendants must not keep the capture runtime alive via inherited
        // pipes after the deadline, an overflow, or a spawn failure.
        child.stdin.destroy();
        child.stdout.destroy();
        child.unref();
        const result: CustomCommandResult = marker === null
            ? { status: 'ok', stdout: output.toString('utf8', 0, length).slice(0, maxChars).trim() }
            : { status: 'failed', marker };
        process.stdout.write(JSON.stringify(result), () => process.exit(0));
    }

    child.stdout.on('data', (chunk: Buffer) => {
        if (finished) {
            return;
        }
        if (chunk.length > maxBytes - length) {
            finish('[Error]', true);
            return;
        }
        chunk.copy(output, length);
        length += chunk.length;
    });
    child.stdout.on('error', () => {
        finish('[Error]', true);
    });
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
        // Commands need not consume their stdin payload.
        if (error.code !== 'EPIPE') {
            finish('[Error]', true);
        }
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
        const marker = error.code === 'ENOENT' ? '[Cmd not found]'
            : error.code === 'EACCES' ? '[Permission denied]' : '[Error]';
        finish(marker, true);
    });
    child.on('exit', (code, signal) => {
        exited = true;
        exitMarker = signal ? `[Signal: ${signal}]`
            : code === 0 ? null : typeof code === 'number' ? `[Exit: ${code}]` : '[Error]';
    });
    // 'exit' can precede the last stdout data. Drain the pipe until 'close', but
    // never wait beyond the deadline for a background descendant to close it.
    child.on('close', () => {
        finish(exitMarker);
    });
    if (request.timeoutMs > 0) {
        timer = setTimeout(() => {
            finish(exited ? exitMarker : '[Timeout]', !exited);
        }, request.timeoutMs);
    }
    child.stdin.end(request.input);
}
