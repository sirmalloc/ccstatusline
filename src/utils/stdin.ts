import type { Readable } from 'node:stream';

function isCompleteJson(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) {
        return false;
    }
    const firstChar = trimmed[0];
    const lastChar = trimmed[trimmed.length - 1];
    if ((firstChar === '{' && lastChar === '}') || (firstChar === '[' && lastChar === ']')) {
        try {
            JSON.parse(trimmed);
            return true;
        } catch {
            return false;
        }
    }
    return false;
}

function ignoreStreamError(): void {
    // Ignore stream cancellation or release errors
}

export { isCompleteJson };

export interface ReadStdinOptions {
    idleTimeoutMs?: number;
    inputStream?: Readable;
    stream?: ReadableStream<Uint8Array>;
}

export async function readStdinBun(options?: ReadStdinOptions): Promise<string> {
    const idleTimeoutMs = options?.idleTimeoutMs ?? 3000;
    const stream = options?.stream ?? (typeof Bun !== 'undefined' ? Bun.stdin.stream() : undefined);
    if (!stream) {
        return '';
    }

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let accumulated = '';

    try {
        for (;;) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const timeoutPromise = new Promise<{ done: true; value: undefined; timedOut: true }>((resolve) => {
                timer = setTimeout(() => {
                    resolve({ done: true, value: undefined, timedOut: true });
                }, idleTimeoutMs);
                if (typeof timer.unref === 'function') {
                    timer.unref();
                }
            });

            const result = await Promise.race([
                reader.read(),
                timeoutPromise
            ]);

            clearTimeout(timer);

            if (result.done) {
                if ('timedOut' in result) {
                    await reader.cancel().catch(ignoreStreamError);
                }
                break;
            }

            const chunkStr = decoder.decode(result.value, { stream: true });
            chunks.push(chunkStr);
            accumulated += chunkStr;

            if (isCompleteJson(accumulated)) {
                await reader.cancel().catch(ignoreStreamError);
                break;
            }
        }
    } finally {
        try {
            reader.releaseLock();
        } catch {
            // Reader might already have been released
        }
    }

    return chunks.join('');
}

export async function readStdinNode(options?: ReadStdinOptions): Promise<string> {
    const idleTimeoutMs = options?.idleTimeoutMs ?? 3000;
    const stream: Readable = options?.inputStream ?? process.stdin;

    stream.setEncoding('utf8');

    const chunks: string[] = [];
    let accumulated = '';

    return new Promise<string>((resolve) => {
        let timer: NodeJS.Timeout | null = null;
        let settled = false;

        const cleanupAndResolve = (result: string) => {
            if (settled) {
                return;
            }
            settled = true;

            if (timer) {
                clearTimeout(timer);
                timer = null;
            }

            stream.removeListener('data', onData);
            stream.removeListener('end', onEnd);
            stream.removeListener('error', onError);

            // Destroy stdin to unblock the Node event loop.
            // On Windows / Volta, stdin EOF never propagates through the Volta shim
            // chain (cmd.exe -> bash -> volta -> node), so without destroying stdin,
            // Node hangs waiting indefinitely for EOF on the input handle.
            stream.destroy();

            resolve(result);
        };

        const resetTimer = () => {
            if (timer) {
                clearTimeout(timer);
            }
            timer = setTimeout(() => {
                cleanupAndResolve(chunks.join(''));
            }, idleTimeoutMs);
            if (typeof timer.unref === 'function') {
                timer.unref();
            }
        };

        const onData = (chunk: string | Buffer) => {
            const chunkStr = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
            chunks.push(chunkStr);
            accumulated += chunkStr;

            if (isCompleteJson(accumulated)) {
                cleanupAndResolve(chunks.join(''));
                return;
            }

            resetTimer();
        };

        const onEnd = () => {
            cleanupAndResolve(chunks.join(''));
        };

        const onError = () => {
            cleanupAndResolve(chunks.join(''));
        };

        stream.on('data', onData);
        stream.on('end', onEnd);
        stream.on('error', onError);

        // Initial idle timer in case no data arrives
        resetTimer();
    });
}

export async function readStdin(options?: ReadStdinOptions): Promise<string | null> {
    if (process.stdin.isTTY) {
        return null;
    }

    try {
        if (typeof Bun !== 'undefined') {
            return await readStdinBun(options);
        } else {
            return await readStdinNode(options);
        }
    } catch {
        return null;
    }
}

export async function flushStdout(): Promise<void> {
    const stdout = process.stdout;

    if (stdout.writableNeedDrain) {
        await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
                stdout.removeListener('drain', onDrain);
                resolve();
            }, 200);
            const onDrain = () => {
                clearTimeout(timer);
                resolve();
            };
            stdout.once('drain', onDrain);
            if (typeof timer.unref === 'function') {
                timer.unref();
            }
        });
    }

    await new Promise<void>((resolve) => {
        stdout.write('', () => {
            resolve();
        });
    });
}
