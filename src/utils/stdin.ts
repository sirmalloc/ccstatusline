/**
 * Default time to wait for the status JSON before giving up on EOF.
 * Override with CCSTATUSLINE_STDIN_TIMEOUT_MS.
 */
const DEFAULT_STDIN_TIMEOUT_MS = 5000;

function getStdinTimeoutMs(): number {
    const raw = Number(process.env.CCSTATUSLINE_STDIN_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STDIN_TIMEOUT_MS;
}

/**
 * Reads the piped status JSON.
 *
 * A host that writes the payload but never closes the write end leaves the async
 * iteration below suspended forever, and the process outlives the render it was
 * spawned for. The timeout bounds that: whatever arrived is still worth rendering,
 * because the payload is written in one shot, so a timeout means the EOF is
 * missing rather than the data.
 */
export async function readStdin(): Promise<string | null> {
    // Check if stdin is a TTY (terminal) - if it is, there's no piped data
    if (process.stdin.isTTY) {
        return null;
    }

    const chunks: string[] = [];

    const read = async (): Promise<string> => {
        // Use Node.js compatible approach
        if (typeof Bun !== 'undefined') {
            // Bun environment
            const decoder = new TextDecoder();
            for await (const chunk of Bun.stdin.stream()) {
                chunks.push(decoder.decode(chunk));
            }
        } else {
            // Node.js environment
            process.stdin.setEncoding('utf8');
            for await (const chunk of process.stdin) {
                chunks.push(chunk as string);
            }
        }
        return chunks.join('');
    };

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            read(),
            new Promise<string>((resolve) => {
                timer = setTimeout(() => resolve(chunks.join('')), getStdinTimeoutMs());
            })
        ]);
    } catch {
        return null;
    } finally {
        if (timer) {
            clearTimeout(timer);
        }

        // The reader can still hold the stream open after the race settles.
        process.stdin.pause();
        process.stdin.unref?.();
    }
}
