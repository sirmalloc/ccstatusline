import * as fs from 'fs';
import { render } from 'ink';
import { PassThrough } from 'node:stream';
import * as os from 'os';
import * as path from 'path';
import React from 'react';
import stripAnsi from 'strip-ansi';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { ExportConfigDialog } from '../ExportConfigDialog';

class MockTtyStream extends PassThrough {
    isTTY = true;
    columns = 120;
    rows = 40;

    setRawMode() {
        return this;
    }

    ref() {
        return this;
    }

    unref() {
        return this;
    }
}

interface CapturedWriteStream extends NodeJS.WriteStream { getOutput: () => string }

function createMockStdin(): NodeJS.ReadStream {
    return new MockTtyStream() as unknown as NodeJS.ReadStream;
}

function createMockStdout(): CapturedWriteStream {
    const stream = new MockTtyStream();
    const chunks: string[] = [];

    stream.on('data', (chunk: Buffer | string) => {
        chunks.push(chunk.toString());
    });

    return Object.assign(stream as unknown as NodeJS.WriteStream, {
        getOutput() {
            return stripAnsi(chunks.join(''));
        }
    });
}

function flushInk() {
    return new Promise((resolve) => {
        setTimeout(resolve, 25);
    });
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate() && Date.now() < deadline) {
        await flushInk();
    }
}

function latestFrame(stdout: CapturedWriteStream): string {
    return stdout.getOutput().split('Export Config').at(-1) ?? '';
}

let tmpDir: string;

async function press(stdin: NodeJS.ReadStream, data: string, times = 1): Promise<void> {
    // One write per keypress with a flush between: Ink reads buffered stdin as one chunk.
    for (let i = 0; i < times; i++) {
        stdin.write(data);
        await flushInk();
    }
}

function mount(props: Partial<React.ComponentProps<typeof ExportConfigDialog>> = {}) {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const onExport = vi.fn();
    const onCancel = vi.fn();
    const instance = render(
        React.createElement(ExportConfigDialog, { initialDir: tmpDir, onExport, onCancel, ...props }),
        { stdin, stdout, stderr, debug: true, exitOnCtrlC: false, patchConsole: false }
    );
    const cleanup = () => {
        instance.unmount();
        instance.cleanup();
        stdin.destroy();
        stdout.destroy();
        stderr.destroy();
    };
    return { stdin, stdout, onExport, onCancel, cleanup };
}

beforeEach(() => {
    // realpath: on macOS os.tmpdir() is a symlink and the picker may emit resolved paths.
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccsl-export-')));
    fs.mkdirSync(path.join(tmpDir, 'single'));
    fs.writeFileSync(path.join(tmpDir, 'single', 'only.json'), '{}');
    fs.mkdirSync(path.join(tmpDir, 'nested'));
    fs.writeFileSync(path.join(tmpDir, 'a.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'x');
    fs.writeFileSync(path.join(tmpDir, 'nested', 'b.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'UPPER.JSON'), '{}');
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ExportConfigDialog', () => {
    it('case 1: Render', async () => {
        const t = mount();
        try {
            await waitFor(() => latestFrame(t.stdout).includes('a.json'));
            const frame = latestFrame(t.stdout);
            expect(frame).toContain('a.json');
            expect(frame).toContain('nested');
            expect(frame).toContain('File name: ccstatusline-config.json');
            expect(frame).toContain('[Tab] edit name');
            expect(frame).toContain('[Ctrl+S] save here');
            expect(frame).toContain('[Ctrl+T] type path');
            expect(frame).not.toContain('notes.txt');
        } finally {
            t.cleanup();
        }
    });

    it('case 2: Ctrl+S', async () => {
        const t = mount();
        try {
            await waitFor(() => latestFrame(t.stdout).includes('a.json'));
            t.stdin.write('\u0013');
            await waitFor(() => t.onExport.mock.calls.length > 0);
            expect(t.onExport).toHaveBeenCalledTimes(1);
            expect(t.onExport).toHaveBeenCalledWith(path.join(tmpDir, 'ccstatusline-config.json'));
        } finally {
            t.cleanup();
        }
    });

    it('case 3: Edit name with .json appended', async () => {
        const t = mount({ initialFileName: 'base' });
        try {
            await waitFor(() => latestFrame(t.stdout).includes('a.json'));
            await press(t.stdin, '\t');
            await waitFor(() => latestFrame(t.stdout).includes('[Tab] back to list'));
            await press(t.stdin, 'X');
            await press(t.stdin, '\r');
            await waitFor(() => t.onExport.mock.calls.length > 0);
            expect(t.onExport).toHaveBeenCalledWith(path.join(tmpDir, 'baseX.json'));
        } finally {
            t.cleanup();
        }
    });

    it('case 4: Tab doesn\'t start a filter', async () => {
        const t = mount();
        try {
            await waitFor(() => latestFrame(t.stdout).includes('a.json'));
            await press(t.stdin, '\t');
            await waitFor(() => latestFrame(t.stdout).includes('[Tab] back to list'));
            await press(t.stdin, 'z');
            await flushInk();
            const frame = latestFrame(t.stdout);
            expect(frame).toContain('File name: ccstatusline-config.jsonz');
            expect(t.onExport.mock.calls.length).toBe(0);
        } finally {
            t.cleanup();
        }
    });

    it('case 5: Upper-case extension kept', async () => {
        const t = mount({ initialFileName: 'x.JSON' });
        try {
            await waitFor(() => latestFrame(t.stdout).includes('a.json'));
            t.stdin.write('\u0013');
            await waitFor(() => t.onExport.mock.calls.length > 0);
            expect(t.onExport).toHaveBeenCalledWith(path.join(tmpDir, 'x.JSON'));
        } finally {
            t.cleanup();
        }
    });

    it('case 6: Empty name', async () => {
        const t = mount({ initialFileName: 'ab' });
        try {
            await waitFor(() => latestFrame(t.stdout).includes('a.json'));
            await press(t.stdin, '\t');
            await waitFor(() => latestFrame(t.stdout).includes('[Tab] back to list'));
            await press(t.stdin, '\u007F', 2);
            await press(t.stdin, '\r');
            await flushInk();
            const frame = latestFrame(t.stdout);
            expect(frame).toContain('File name cannot be empty');
            expect(t.onExport.mock.calls.length).toBe(0);
            await press(t.stdin, 'q');
            await flushInk();
            expect(latestFrame(t.stdout)).not.toContain('File name cannot be empty');
        } finally {
            t.cleanup();
        }
    });

    it('case 7: Separator', async () => {
        const t = mount({ initialFileName: 'a' });
        try {
            await waitFor(() => latestFrame(t.stdout).includes('a.json'));
            await press(t.stdin, '\t');
            await waitFor(() => latestFrame(t.stdout).includes('[Tab] back to list'));
            t.stdin.write('/b');
            await flushInk();
            await press(t.stdin, '\u0013');
            await flushInk();
            const frame = latestFrame(t.stdout);
            expect(frame).toContain('cannot contain');
            expect(t.onExport.mock.calls.length).toBe(0);
        } finally {
            t.cleanup();
        }
    });

    it('case 8: Enter on an existing file', async () => {
        const t = mount({ initialDir: path.join(tmpDir, 'single') });
        try {
            await waitFor(() => latestFrame(t.stdout).includes('only.json'));
            await press(t.stdin, '\r');
            await waitFor(() => t.onExport.mock.calls.length > 0);
            expect(t.onExport).toHaveBeenCalledWith(path.join(tmpDir, 'single', 'only.json'));
        } finally {
            t.cleanup();
        }
    });

    it('case 9: Enter on a folder, then Ctrl+S', async () => {
        const t = mount();
        try {
            await waitFor(() => latestFrame(t.stdout).includes('nested'));
            await press(t.stdin, '\r');
            await waitFor(() => latestFrame(t.stdout).includes('b.json'));
            t.stdin.write('\u0013');
            await waitFor(() => t.onExport.mock.calls.length > 0);
            expect(t.onExport).toHaveBeenCalledWith(path.join(tmpDir, 'nested', 'ccstatusline-config.json'));
        } finally {
            t.cleanup();
        }
    });

    it('case 10: Ctrl+T pre-fill', async () => {
        const t = mount();
        try {
            await waitFor(() => latestFrame(t.stdout).includes('a.json'));
            t.stdin.write('\u0014');
            await waitFor(() => latestFrame(t.stdout).includes('Path:'));
            const frame = latestFrame(t.stdout);
            expect(frame).toContain(`Path: ${tmpDir}${path.sep}ccstatusline-config.json`);
            t.stdin.write('\r');
            await waitFor(() => t.onExport.mock.calls.length > 0);
            expect(t.onExport).toHaveBeenCalledWith(path.join(tmpDir, 'ccstatusline-config.json'));
        } finally {
            t.cleanup();
        }
    });

    it('case 11: Path to a missing folder', async () => {
        const t = mount();
        try {
            await waitFor(() => latestFrame(t.stdout).includes('a.json'));
            t.stdin.write('\u0014');
            await waitFor(() => latestFrame(t.stdout).includes('Path:'));
            const nameLength = 'ccstatusline-config.json'.length;
            await press(t.stdin, '\u007F', nameLength);
            t.stdin.write('missing/dir/out');
            await flushInk();
            await press(t.stdin, '\r');
            await waitFor(() => t.onExport.mock.calls.length > 0);
            expect(t.onExport).toHaveBeenCalledWith(path.join(tmpDir, 'missing', 'dir', 'out.json'));
        } finally {
            t.cleanup();
        }
    });

    it('case 12: Path that is an existing folder', async () => {
        const t = mount();
        try {
            await waitFor(() => latestFrame(t.stdout).includes('a.json'));
            t.stdin.write('\u0014');
            await waitFor(() => latestFrame(t.stdout).includes('Path:'));
            const nameLength = 'ccstatusline-config.json'.length;
            await press(t.stdin, '\u007F', nameLength);
            t.stdin.write('nested');
            await flushInk();
            await press(t.stdin, '\r');
            await waitFor(() => latestFrame(t.stdout).includes('[Ctrl+T] type path'));
            const frame = latestFrame(t.stdout);
            expect(frame).toContain('b.json');
            expect(t.onExport.mock.calls.length).toBe(0);
        } finally {
            t.cleanup();
        }
    });

    it('case 13: Esc', async () => {
        const t = mount();
        try {
            await waitFor(() => latestFrame(t.stdout).includes('a.json'));
            await press(t.stdin, '\u001B');
            await waitFor(() => t.onCancel.mock.calls.length > 0);
            expect(t.onCancel).toHaveBeenCalledTimes(1);
        } finally {
            t.cleanup();
        }
    });

    it('case 13b: Esc in path mode', async () => {
        const t = mount();
        try {
            await waitFor(() => latestFrame(t.stdout).includes('a.json'));
            t.stdin.write('\u0014');
            await waitFor(() => latestFrame(t.stdout).includes('Path:'));
            t.stdin.write('\u001B');
            await waitFor(() => latestFrame(t.stdout).includes('[Tab] edit name'));
            expect(t.onCancel.mock.calls.length).toBe(0);
        } finally {
            t.cleanup();
        }
    });

    it('case 13c: Esc in name focus', async () => {
        const t = mount();
        try {
            await waitFor(() => latestFrame(t.stdout).includes('a.json'));
            t.stdin.write('\t');
            await waitFor(() => latestFrame(t.stdout).includes('[Tab] back to list'));
            t.stdin.write('\u001B');
            await waitFor(() => latestFrame(t.stdout).includes('[Tab] edit name'));
            await flushInk();
            expect(t.onCancel.mock.calls.length).toBe(0);
            t.stdin.write('\u001B');
            await waitFor(() => t.onCancel.mock.calls.length > 0);
            expect(t.onCancel).toHaveBeenCalledTimes(1);
        } finally {
            t.cleanup();
        }
    });

    it('case 14: Double submit', async () => {
        const t = mount();
        try {
            await waitFor(() => latestFrame(t.stdout).includes('a.json'));
            t.stdin.write('\u0013');
            await waitFor(() => t.onExport.mock.calls.length > 0);
            t.stdin.write('\u0013');
            await flushInk();
            expect(t.onExport).toHaveBeenCalledTimes(1);
        } finally {
            t.cleanup();
        }
    });

    it('case 15: Initial props', async () => {
        const t = mount({ initialDir: path.join(tmpDir, 'nested'), initialFileName: 'mine.json' });
        try {
            await waitFor(() => latestFrame(t.stdout).includes('b.json'));
            const frame = latestFrame(t.stdout);
            expect(frame).toContain('File name: mine.json');
        } finally {
            t.cleanup();
        }
    });
});
