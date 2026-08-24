import { Readable } from 'node:stream';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { readStdin } from '../stdin';

const originalStdin = process.stdin;
const originalTimeout = process.env.CCSTATUSLINE_STDIN_TIMEOUT_MS;

function setStdin(stream: Readable & { isTTY?: boolean }) {
    Object.defineProperty(process, 'stdin', {
        value: stream,
        configurable: true
    });
}

describe('readStdin', () => {
    beforeEach(() => {
        process.env.CCSTATUSLINE_STDIN_TIMEOUT_MS = '50';
    });

    afterEach(() => {
        Object.defineProperty(process, 'stdin', {
            value: originalStdin,
            configurable: true
        });

        if (originalTimeout === undefined) {
            delete process.env.CCSTATUSLINE_STDIN_TIMEOUT_MS;
        } else {
            process.env.CCSTATUSLINE_STDIN_TIMEOUT_MS = originalTimeout;
        }

        vi.useRealTimers();
    });

    it('returns null when stdin is a TTY', async () => {
        const stream = Object.assign(Readable.from([]), { isTTY: true });
        setStdin(stream);

        await expect(readStdin()).resolves.toBeNull();
    });

    it('reads the payload when the writer closes the stream', async () => {
        const stream = Object.assign(Readable.from(['{"session_id":"abc"}']), { isTTY: false });
        setStdin(stream);

        await expect(readStdin()).resolves.toBe('{"session_id":"abc"}');
    });

    it('resolves with what arrived when EOF never comes', async () => {
        const stream = Object.assign(new Readable({ read() { /* never pushes EOF */ } }), { isTTY: false });
        stream.push('{"session_id":"abc"}');
        setStdin(stream);

        // Without the timeout this would hang and the process would outlive the render.
        await expect(readStdin()).resolves.toBe('{"session_id":"abc"}');
    });
});
