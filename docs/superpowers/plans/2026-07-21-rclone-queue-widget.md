# RClone Queue Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ccstatusline widget that shows the pending-upload queue length for a configurable rclone VFS mount (default `dropbox`), by tailing that mount's own rclone log file — no subprocess spawned per render.

**Architecture:** One new widget file (`src/widgets/RCloneQueue.tsx`) holds three layers in increasing order of dependency: (1) a pure data layer that derives the log path from a remote name, tails the last 64KB of the log file, and regex-extracts the most recent `to upload N` figure, wrapped in a 15s in-process cache; (2) the `RCloneQueueWidget` class implementing the standard `Widget` interface, rendering `RClone: <N>` or `RClone: n/a`; (3) an in-TUI text editor (`RCloneRemoteEditor`) for changing which remote name the widget watches, following the same `useInput`-driven pattern as `CustomTextWidget`'s editor. The widget is registered the same way every other widget is: one barrel export, one manifest entry.

**Tech Stack:** TypeScript, React + Ink (TUI rendering), Zod (schema — no changes needed, `metadata` is already `Record<string, string>`), Vitest test syntax executed via `bun test` (this repo's `vitest.config.ts` config fails to load under `bunx vitest run` in this environment — `execSync`/module spying only works under Bun's own test runner here; use `bun test <path>` for every test run in this plan, not `bunx vitest`).

## Global Constraints

- Full spec: `docs/superpowers/specs/2026-07-21-rclone-queue-widget-design.md`.
- Log path convention: `~/.cache/rclone/<remoteName>.log` (derived via `path.join(os.homedir(), '.cache', 'rclone', \`${remoteName}.log\`)`).
- Tail-read window: last 64KB of the log file (`TAIL_BYTES = 64 * 1024`), discarding a possibly-partial first line when the read didn't start at byte 0.
- Cache TTL: 15 seconds (`CACHE_TTL_MS = 15_000`), in-process only (no persistent cross-process cache needed).
- Render format: `RClone: <N>` normally, bare `<N>` when `item.rawValue` is true; `RClone: n/a` (bare `n/a` in raw mode) when the log file is missing or has no matching line yet. A genuine queue length of `0` is a real value, not a fallback.
- Default remote name: `'dropbox'`, stored in `item.metadata.remoteName`, editable via an `(e)dit remote` in-TUI text editor.
- Widget category: `'Environment'`. Default color: `'blue'`.
- Every test in this plan runs via `bun test <path>`, not `bunx vitest run <path>` (confirmed during design research: `bunx vitest run` fails to even load `vitest.config.ts` in this environment, while `bun test` runs the exact same Vitest-syntax test files successfully).
- Run `bun install` once at the start of Task 1 if `node_modules` isn't already present in this worktree.

---

### Task 1: Core data layer — log path, tail read, parse, cache

**Files:**
- Create: `src/widgets/RCloneQueue.tsx`
- Create: `src/widgets/__tests__/RCloneQueue.test.tsx`

**Interfaces:**
- Produces (used by Task 2): `getRcloneLogPath(remoteName: string): string`, `getQueueLength(remoteName: string, now?: number): number | null`, `clearRCloneQueueCache(): void`, `CACHE_TTL_MS: number` (exported constant), `DEFAULT_REMOTE_NAME: string` (exported constant, value `'dropbox'`).
- Also produced (used only by this task's own tests, but exported for direct unit testing): `readLogTail(logPath: string, maxBytes?: number): string | null`, `parseQueueLength(logText: string): number | null`.

- [ ] **Step 1: Confirm dependencies are installed**

Run: `cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter && ls node_modules/.bin/vitest 2>/dev/null || bun install`
Expected: either the file already exists, or `bun install` completes with a package count printed (e.g. `547 packages installed`).

- [ ] **Step 2: Write the failing tests for `parseQueueLength`, `readLogTail`, and `getQueueLength`**

Create `src/widgets/__tests__/RCloneQueue.test.tsx`:

```tsx
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    clearRCloneQueueCache,
    DEFAULT_REMOTE_NAME,
    getQueueLength,
    getRcloneLogPath,
    parseQueueLength,
    readLogTail
} from '../RCloneQueue';

describe('parseQueueLength', () => {
    it('extracts the queue length from a normal vfs cache stats line', () => {
        const log = `2026/07/21 19:16:46 INFO  : Dropbox root '': vfs cache: cleaned: objects 56315 (was 56315) in use 1381, to upload 1374, uploading 6, total size 45.479Gi (was 45.479Gi)\n`;
        expect(parseQueueLength(log)).toBe(1374);
    });

    it('picks the most recent matching line when there are several', () => {
        const log = [
            'INFO : vfs cache: cleaned: in use 100, to upload 90, uploading 2, total size 1Gi',
            'INFO : some unrelated line',
            'INFO : vfs cache: cleaned: in use 50, to upload 40, uploading 1, total size 1Gi'
        ].join('\n');
        expect(parseQueueLength(log)).toBe(40);
    });

    it('returns null when no line matches', () => {
        const log = 'INFO : Dropbox root \'\': Copied (new)\nINFO : some other unrelated line\n';
        expect(parseQueueLength(log)).toBeNull();
    });

    it('returns null for an empty string', () => {
        expect(parseQueueLength('')).toBeNull();
    });

    it('does not throw on a malformed/truncated line', () => {
        const log = 'garbage that mentions to upload but not a number: to upload abc\n';
        expect(parseQueueLength(log)).toBeNull();
    });
});

describe('readLogTail', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rclone-queue-widget-test-'));

    afterEach(() => {
        for (const file of fs.readdirSync(tmpDir)) {
            fs.unlinkSync(path.join(tmpDir, file));
        }
    });

    it('returns null when the file does not exist', () => {
        expect(readLogTail(path.join(tmpDir, 'does-not-exist.log'))).toBeNull();
    });

    it('returns the full content when the file is smaller than maxBytes', () => {
        const logPath = path.join(tmpDir, 'small.log');
        fs.writeFileSync(logPath, 'line one\nline two\n');
        expect(readLogTail(logPath, 1024)).toBe('line one\nline two\n');
    });

    it('discards a partial first line when the read window starts mid-file', () => {
        const logPath = path.join(tmpDir, 'large.log');
        // "AAAAA\n" (6 bytes) + "to upload 42\n" (13 bytes) = 19 bytes total.
        // With maxBytes=13, the read window starts at byte 6, landing exactly
        // on the second line's start (no partial line to discard in this case),
        // so use an offset that actually lands mid-line instead:
        fs.writeFileSync(logPath, 'AAAAA\nto upload 42\n');
        const content = fs.readFileSync(logPath, 'utf8');
        expect(content.length).toBe(19);
        // maxBytes=15 makes the window start at byte 4, which is inside "AAAAA"
        const tail = readLogTail(logPath, 15);
        expect(tail).not.toBeNull();
        expect(tail).not.toContain('AAA');
        expect(parseQueueLength(tail ?? '')).toBe(42);
    });
});

describe('getQueueLength (cache)', () => {
    const remoteName = 'test-remote';
    const logPath = getRcloneLogPath(remoteName);

    beforeEach(() => {
        clearRCloneQueueCache();
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
    });

    afterEach(() => {
        clearRCloneQueueCache();
        if (fs.existsSync(logPath)) {
            fs.rmSync(logPath);
        }
    });

    it('returns the default remote name constant', () => {
        expect(DEFAULT_REMOTE_NAME).toBe('dropbox');
    });

    it('reads a fresh value when nothing is cached yet', () => {
        fs.writeFileSync(logPath, 'INFO : vfs cache: cleaned: in use 10, to upload 7, uploading 1, total size 1Gi\n');
        expect(getQueueLength(remoteName, 1000)).toBe(7);
    });

    it('returns the cached value within the TTL window even if the file changes', () => {
        fs.writeFileSync(logPath, 'INFO : vfs cache: cleaned: in use 10, to upload 7, uploading 1, total size 1Gi\n');
        expect(getQueueLength(remoteName, 1000)).toBe(7);

        fs.writeFileSync(logPath, 'INFO : vfs cache: cleaned: in use 10, to upload 999, uploading 1, total size 1Gi\n');
        // Still within CACHE_TTL_MS (15000) of the first call.
        expect(getQueueLength(remoteName, 1000 + CACHE_TTL_MS - 1)).toBe(7);
    });

    it('re-reads the file once the TTL window has elapsed', () => {
        fs.writeFileSync(logPath, 'INFO : vfs cache: cleaned: in use 10, to upload 7, uploading 1, total size 1Gi\n');
        expect(getQueueLength(remoteName, 1000)).toBe(7);

        fs.writeFileSync(logPath, 'INFO : vfs cache: cleaned: in use 10, to upload 999, uploading 1, total size 1Gi\n');
        expect(getQueueLength(remoteName, 1000 + CACHE_TTL_MS)).toBe(999);
    });

    it('returns null (and caches null) when the log file does not exist', () => {
        expect(getQueueLength(remoteName, 1000)).toBeNull();
    });

    it('derives the log path from ~/.cache/rclone/<remoteName>.log', () => {
        expect(getRcloneLogPath('gdrive')).toBe(path.join(os.homedir(), '.cache', 'rclone', 'gdrive.log'));
    });
});
```

Run: `cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter && bun test src/widgets/__tests__/RCloneQueue.test.tsx`
Expected: FAIL — `Cannot find module '../RCloneQueue'` (the file doesn't exist yet).

- [ ] **Step 3: Implement the pure data layer**

Create `src/widgets/RCloneQueue.tsx` with this content (widget class and editor come in later tasks — for now just the data layer, so it compiles standalone):

```tsx
import fs from 'fs';
import os from 'os';
import path from 'path';

export const DEFAULT_REMOTE_NAME = 'dropbox';
export const CACHE_TTL_MS = 15_000;
const TAIL_BYTES = 64 * 1024;
const TO_UPLOAD_RE = /to upload (\d+)/;

interface QueueCacheEntry {
    value: number | null;
    createdAt: number;
}

const queueCache = new Map<string, QueueCacheEntry>();

export function getRcloneLogPath(remoteName: string): string {
    return path.join(os.homedir(), '.cache', 'rclone', `${remoteName}.log`);
}

export function readLogTail(logPath: string, maxBytes: number = TAIL_BYTES): string | null {
    let fd: number;
    try {
        fd = fs.openSync(logPath, 'r');
    } catch {
        return null;
    }

    try {
        const size = fs.fstatSync(fd).size;
        const readSize = Math.min(size, maxBytes);
        const start = size - readSize;
        const buffer = Buffer.alloc(readSize);
        if (readSize > 0) {
            fs.readSync(fd, buffer, 0, readSize, start);
        }

        let text = buffer.toString('utf8');
        if (start > 0) {
            // The window may start mid-line; discard that partial first line.
            const firstNewline = text.indexOf('\n');
            text = firstNewline === -1 ? '' : text.slice(firstNewline + 1);
        }

        return text;
    } finally {
        fs.closeSync(fd);
    }
}

export function parseQueueLength(logText: string): number | null {
    const lines = logText.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line) {
            continue;
        }

        const match = TO_UPLOAD_RE.exec(line);
        const raw = match?.[1];
        if (raw !== undefined) {
            return parseInt(raw, 10);
        }
    }

    return null;
}

export function getQueueLength(remoteName: string, now: number = Date.now()): number | null {
    const cached = queueCache.get(remoteName);
    if (cached && now - cached.createdAt < CACHE_TTL_MS) {
        return cached.value;
    }

    const logPath = getRcloneLogPath(remoteName);
    const text = readLogTail(logPath);
    const value = text === null ? null : parseQueueLength(text);
    queueCache.set(remoteName, { value, createdAt: now });
    return value;
}

export function clearRCloneQueueCache(): void {
    queueCache.clear();
}
```

- [ ] **Step 4: Run tests again to verify they pass**

Run: `cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter && bun test src/widgets/__tests__/RCloneQueue.test.tsx`
Expected: PASS — all tests green (14 tests: 5 `parseQueueLength` + 3 `readLogTail` + 6 `getQueueLength`).

- [ ] **Step 5: Lint and commit**

Run: `cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter && bun tsc --noEmit && bunx eslint src/widgets/RCloneQueue.tsx src/widgets/__tests__/RCloneQueue.test.tsx --config eslint.config.js --max-warnings=0`
Expected: no output, exit code 0 (clean).

```bash
cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter
git add src/widgets/RCloneQueue.tsx src/widgets/__tests__/RCloneQueue.test.tsx
git commit -m "feat(widgets): add rclone queue data layer (log tail + cache)"
```

---

### Task 2: `RCloneQueueWidget` class

**Files:**
- Modify: `src/widgets/RCloneQueue.tsx` (append the widget class; do not touch Task 1's data-layer functions)
- Modify: `src/widgets/__tests__/RCloneQueue.test.tsx` (append widget tests)

**Interfaces:**
- Consumes (from Task 1): `getQueueLength(remoteName: string): number | null`, `DEFAULT_REMOTE_NAME: string`.
- Produces (used by Task 3): `getRemoteName(item: WidgetItem): string` (exported helper), the `RCloneQueueWidget` class itself.

- [ ] **Step 1: Write the failing widget tests**

Append to `src/widgets/__tests__/RCloneQueue.test.tsx` (add these imports to the existing top-of-file import block, and add this `describe` block at the end of the file):

Add to imports:
```tsx
import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
```

Append:
```tsx
describe('RCloneQueueWidget', () => {
    const remoteName = 'test-remote-widget';
    const logPath = getRcloneLogPath(remoteName);

    beforeEach(() => {
        clearRCloneQueueCache();
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
    });

    afterEach(() => {
        clearRCloneQueueCache();
        if (fs.existsSync(logPath)) {
            fs.rmSync(logPath);
        }
    });

    describe('metadata', () => {
        const widget = new RCloneQueueWidget();

        it('returns correct display name', () => {
            expect(widget.getDisplayName()).toBe('RClone Queue');
        });

        it('returns correct category', () => {
            expect(widget.getCategory()).toBe('Environment');
        });

        it('returns blue as default color', () => {
            expect(widget.getDefaultColor()).toBe('blue');
        });

        it('supports raw value', () => {
            expect(widget.supportsRawValue()).toBe(true);
        });

        it('supports colors', () => {
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue' };
            expect(widget.supportsColors(item)).toBe(true);
        });

        it('shows the default remote name in the editor display when unset', () => {
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue' };
            expect(widget.getEditorDisplay(item).displayText).toBe('RClone Queue (dropbox)');
        });

        it('shows the configured remote name in the editor display', () => {
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue', metadata: { remoteName: 'gdrive' } };
            expect(widget.getEditorDisplay(item).displayText).toBe('RClone Queue (gdrive)');
        });
    });

    describe('preview mode', () => {
        const widget = new RCloneQueueWidget();

        it('returns labeled mock data', () => {
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue' };
            expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('RClone: 385');
        });

        it('returns bare mock data when rawValue is set', () => {
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue', rawValue: true };
            expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('385');
        });
    });

    describe('render', () => {
        const widget = new RCloneQueueWidget();

        it('renders the queue length from the configured remote\'s log', () => {
            fs.writeFileSync(logPath, 'INFO : vfs cache: cleaned: in use 10, to upload 12, uploading 1, total size 1Gi\n');
            const context: RenderContext = {};
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue', metadata: { remoteName } };
            expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('RClone: 12');
        });

        it('renders the bare number when rawValue is set', () => {
            fs.writeFileSync(logPath, 'INFO : vfs cache: cleaned: in use 10, to upload 12, uploading 1, total size 1Gi\n');
            const context: RenderContext = {};
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue', metadata: { remoteName }, rawValue: true };
            expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('12');
        });

        it('renders "n/a" when the log file does not exist', () => {
            const context: RenderContext = {};
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue', metadata: { remoteName } };
            expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('RClone: n/a');
        });

        it('renders bare "n/a" when the log file does not exist and rawValue is set', () => {
            const context: RenderContext = {};
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue', metadata: { remoteName }, rawValue: true };
            expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('n/a');
        });

        it('renders 0 as a real value, not as n/a', () => {
            fs.writeFileSync(logPath, 'INFO : vfs cache: cleaned: in use 10, to upload 0, uploading 0, total size 1Gi\n');
            const context: RenderContext = {};
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue', metadata: { remoteName } };
            expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('RClone: 0');
        });

        it('defaults to the dropbox remote when no metadata is set', () => {
            expect(getRemoteName({ id: 'rc', type: 'rclone-queue' })).toBe('dropbox');
        });

        it('uses the configured remote name from metadata', () => {
            expect(getRemoteName({ id: 'rc', type: 'rclone-queue', metadata: { remoteName: 'gdrive' } })).toBe('gdrive');
        });
    });
});
```

Also update the `RCloneQueue` import line at the top of the test file to pull in the new names:

```tsx
import {
    clearRCloneQueueCache,
    DEFAULT_REMOTE_NAME,
    getQueueLength,
    getRcloneLogPath,
    getRemoteName,
    parseQueueLength,
    RCloneQueueWidget,
    readLogTail
} from '../RCloneQueue';
```

Run: `cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter && bun test src/widgets/__tests__/RCloneQueue.test.tsx`
Expected: FAIL — `getRemoteName` and `RCloneQueueWidget` are not exported yet.

- [ ] **Step 2: Implement `getRemoteName` and `RCloneQueueWidget`**

Append to `src/widgets/RCloneQueue.tsx` (after the Task 1 functions, before nothing else exists yet — this is the end of the file for now). First add these imports at the top of the file, alongside the existing `fs`/`os`/`path` imports:

```tsx
import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
```

Then append this to the bottom of the file:

```tsx
export function getRemoteName(item: WidgetItem): string {
    return item.metadata?.remoteName ?? DEFAULT_REMOTE_NAME;
}

export class RCloneQueueWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows the pending upload queue length for an rclone VFS mount (e.g. Dropbox)'; }
    getDisplayName(): string { return 'RClone Queue'; }
    getCategory(): string { return 'Environment'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: `${this.getDisplayName()} (${getRemoteName(item)})` };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '385' : 'RClone: 385';
        }

        const remoteName = getRemoteName(item);
        const queueLength = getQueueLength(remoteName);

        if (queueLength === null) {
            return item.rawValue ? 'n/a' : 'RClone: n/a';
        }

        return item.rawValue ? `${queueLength}` : `RClone: ${queueLength}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
```

Run: `cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter && bun test src/widgets/__tests__/RCloneQueue.test.tsx`
Expected: PASS — all tests green (14 from Task 1 + 16 new = 30 tests).

- [ ] **Step 3: Lint and commit**

Run: `cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter && bun tsc --noEmit && bunx eslint src/widgets/RCloneQueue.tsx src/widgets/__tests__/RCloneQueue.test.tsx --config eslint.config.js --max-warnings=0`
Expected: no output, exit code 0.

```bash
cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter
git add src/widgets/RCloneQueue.tsx src/widgets/__tests__/RCloneQueue.test.tsx
git commit -m "feat(widgets): add RCloneQueueWidget render/preview/metadata"
```

---

### Task 3: Remote-name in-TUI editor

**Files:**
- Modify: `src/widgets/RCloneQueue.tsx` (append editor component + wire it into the widget class)
- Modify: `src/widgets/__tests__/RCloneQueue.test.tsx` (append editor interaction tests, using the same mock-TTY-stream harness as `src/widgets/shared/__tests__/symbol-override-editor.test.tsx`)

**Interfaces:**
- Consumes (from Tasks 1-2): `DEFAULT_REMOTE_NAME`, `getRemoteName(item)`, the `RCloneQueueWidget` class (its `getCustomKeybinds` and `renderEditor` methods are added in this task, not new methods elsewhere).
- Produces: nothing consumed by later tasks — this is the last widget-internals task before registration.

- [ ] **Step 1: Write the failing editor tests**

Add these imports to the top of `src/widgets/__tests__/RCloneQueue.test.tsx` (alongside the existing ones):

```tsx
import { render } from 'ink';
import { PassThrough } from 'node:stream';
import stripAnsi from 'strip-ansi';
```

Append this harness and `describe` block at the end of `src/widgets/__tests__/RCloneQueue.test.tsx`:

```tsx
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
            return chunks.join('');
        }
    });
}

function flushInk() {
    return new Promise((resolve) => {
        setTimeout(resolve, 25);
    });
}

function renderRemoteEditor(item: WidgetItem, onComplete = vi.fn(), onCancel = vi.fn()) {
    const widget = new RCloneQueueWidget();
    const editorElement = widget.renderEditor?.({ widget: item, onComplete, onCancel, action: 'edit-remote' });
    if (!editorElement) {
        throw new Error('renderEditor did not return an element');
    }

    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const instance = render(editorElement, {
        stdin,
        stdout,
        stderr,
        debug: true,
        exitOnCtrlC: false,
        patchConsole: false
    });

    return {
        instance, stdin, stdout, stderr, onComplete, onCancel
    };
}

function cleanupEditor(rendered: ReturnType<typeof renderRemoteEditor>): void {
    rendered.instance.unmount();
    rendered.instance.cleanup();
    rendered.stdin.destroy();
    rendered.stdout.destroy();
    rendered.stderr.destroy();
}

function getPlainOutput(output: string): string {
    return stripAnsi(output).replace(/\r\n/g, '\n');
}

describe('RCloneQueueWidget custom keybind', () => {
    it('exposes an (e)dit remote keybind', () => {
        const widget = new RCloneQueueWidget();
        expect(widget.getCustomKeybinds?.()).toEqual([
            { key: 'e', label: '(e)dit remote', action: 'edit-remote' }
        ]);
    });
});

describe('RCloneRemoteEditor', () => {
    it('shows the current remote name pre-filled', async () => {
        const rendered = renderRemoteEditor({ id: 'rc', type: 'rclone-queue', metadata: { remoteName: 'gdrive' } });
        try {
            await flushInk();
            const output = getPlainOutput(rendered.stdout.getOutput());
            expect(output).toContain('gdrive');
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('saves the typed remote name on Enter', async () => {
        const rendered = renderRemoteEditor({ id: 'rc', type: 'rclone-queue' });
        try {
            await flushInk();
            // Backspace out "dropbox" (7 chars), then type "gdrive".
            rendered.stdin.write('\b'.repeat(7));
            await flushInk();
            rendered.stdin.write('gdrive');
            await flushInk();
            rendered.stdin.write('\r');
            await flushInk();

            const updated = rendered.onComplete.mock.calls[0]?.[0] as WidgetItem | undefined;
            expect(updated?.metadata?.remoteName).toBe('gdrive');
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('falls back to the default remote name when saved empty', async () => {
        const rendered = renderRemoteEditor({ id: 'rc', type: 'rclone-queue' });
        try {
            await flushInk();
            rendered.stdin.write('\b'.repeat(7));
            await flushInk();
            rendered.stdin.write('\r');
            await flushInk();

            const updated = rendered.onComplete.mock.calls[0]?.[0] as WidgetItem | undefined;
            expect(updated?.metadata?.remoteName).toBe('dropbox');
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('cancels without calling onComplete on Escape', async () => {
        const rendered = renderRemoteEditor({ id: 'rc', type: 'rclone-queue' });
        try {
            await flushInk();
            rendered.stdin.write('\x1b');
            await flushInk();

            expect(rendered.onComplete).not.toHaveBeenCalled();
            expect(rendered.onCancel).toHaveBeenCalledTimes(1);
        } finally {
            cleanupEditor(rendered);
        }
    });
});
```

Run: `cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter && bun test src/widgets/__tests__/RCloneQueue.test.tsx`
Expected: FAIL — `widget.renderEditor` and `widget.getCustomKeybinds` are `undefined` (not implemented yet), so `renderRemoteEditor` throws.

- [ ] **Step 2: Implement the editor component and wire it into the widget**

Add these imports at the top of `src/widgets/RCloneQueue.tsx`, alongside the existing ones:

```tsx
import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import { shouldInsertInput } from '../utils/input-guards';
```

Also extend the `Widget`-types import to include `CustomKeybind` and `WidgetEditorProps`:

```tsx
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
```

Add the edit-action constant near the other exported constants:

```tsx
export const EDIT_REMOTE_ACTION = 'edit-remote';
```

Add these two methods to the `RCloneQueueWidget` class (after `getEditorDisplay`, before `render`):

```tsx
    getCustomKeybinds(): CustomKeybind[] {
        return [{ key: 'e', label: '(e)dit remote', action: EDIT_REMOTE_ACTION }];
    }
```

And after the `supportsColors` method, still inside the class:

```tsx
    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return <RCloneRemoteEditor {...props} />;
    }
```

Finally, append the editor component at the end of the file:

```tsx
const RCloneRemoteEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel }) => {
    const [text, setText] = useState(getRemoteName(widget));
    const [cursorPos, setCursorPos] = useState(text.length);

    useInput((input, key) => {
        if (key.return) {
            const trimmed = text.trim();
            onComplete({
                ...widget,
                metadata: { ...widget.metadata, remoteName: trimmed.length > 0 ? trimmed : DEFAULT_REMOTE_NAME }
            });
        } else if (key.escape) {
            onCancel();
        } else if (key.leftArrow) {
            setCursorPos(pos => Math.max(0, pos - 1));
        } else if (key.rightArrow) {
            setCursorPos(pos => Math.min(text.length, pos + 1));
        } else if (key.backspace) {
            setCursorPos((pos) => {
                if (pos > 0) {
                    setText(t => t.slice(0, pos - 1) + t.slice(pos));
                    return pos - 1;
                }
                return pos;
            });
        } else if (key.delete) {
            setText((t) => {
                if (cursorPos < t.length) {
                    return t.slice(0, cursorPos) + t.slice(cursorPos + 1);
                }
                return t;
            });
        } else if (shouldInsertInput(input, key)) {
            setText(t => t.slice(0, cursorPos) + input + t.slice(cursorPos));
            setCursorPos(pos => pos + input.length);
        }
    });

    let display = 'Enter rclone remote name: ';
    for (let i = 0; i < text.length; i++) {
        display += i === cursorPos ? `\x1b[7m${text[i]}\x1b[0m` : text[i];
    }
    if (cursorPos >= text.length) {
        display += '\x1b[7m \x1b[0m';
    }

    return (
        <Box flexDirection='column'>
            <Text>{display}</Text>
            <Text dimColor>{'←→ move cursor, Enter save, ESC cancel (default: dropbox)'}</Text>
        </Box>
    );
};
```

Run: `cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter && bun test src/widgets/__tests__/RCloneQueue.test.tsx`
Expected: PASS — all tests green (30 from Tasks 1-2 + 5 new = 35 tests).

- [ ] **Step 3: Lint and commit**

Run: `cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter && bun tsc --noEmit && bunx eslint src/widgets/RCloneQueue.tsx src/widgets/__tests__/RCloneQueue.test.tsx --config eslint.config.js --max-warnings=0`
Expected: no output, exit code 0. If ESLint flags the `\x1b` escape codes or hex-escape style, match the exact style already used in `src/widgets/CustomText.tsx` for its cursor-highlight sequences (it uses the same `\x1b[7m...\x1b[0m` pattern and passes lint in this repo already).

```bash
cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter
git add src/widgets/RCloneQueue.tsx src/widgets/__tests__/RCloneQueue.test.tsx
git commit -m "feat(widgets): add remote-name editor to RCloneQueueWidget"
```

---

### Task 4: Registration and final verification

**Files:**
- Modify: `src/widgets/index.ts:75` (end of file — append one export line)
- Modify: `src/utils/widget-manifest.ts:93` (end of `WIDGET_MANIFEST` array — append one entry)

**Interfaces:**
- Consumes: `RCloneQueueWidget` from `./RCloneQueue` (Task 2).
- Produces: nothing further — this is the last task.

- [ ] **Step 1: Add the barrel export**

In `src/widgets/index.ts`, the file currently ends with:
```ts
export { RemoteControlStatusWidget } from './RemoteControlStatus';
```

Append a new line after it:
```ts
export { RCloneQueueWidget } from './RCloneQueue';
```

- [ ] **Step 2: Add the manifest entry**

In `src/utils/widget-manifest.ts`, the `WIDGET_MANIFEST` array currently ends with:
```ts
    { type: 'compaction-counter', create: () => new widgets.CompactionCounterWidget() }
];
```

Change it to:
```ts
    { type: 'compaction-counter', create: () => new widgets.CompactionCounterWidget() },
    { type: 'rclone-queue', create: () => new widgets.RCloneQueueWidget() }
];
```

- [ ] **Step 3: Write a manifest registration test**

Check whether a manifest-level test already exists:

Run: `cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter && find src -iname "*widget-manifest*" -path "*__tests__*"`

If a file like `src/utils/__tests__/widget-manifest.test.ts` exists, open it and add a case following its existing pattern asserting `'rclone-queue'` creates an `RCloneQueueWidget` instance (mirror however the existing test asserts this for e.g. `'free-memory'` or `'compaction-counter'`). If no such test file exists, skip this step — manifest wiring is still covered end-to-end by Step 4 below.

- [ ] **Step 4: Run the full test suite, typecheck, and lint**

Run: `cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter && bun test 2>&1 | tail -30`
Expected: all test files pass, including `src/widgets/__tests__/RCloneQueue.test.tsx` (35 tests) and no regressions in any other widget test file.

Run: `cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter && bun run lint`
Expected: exits 0 with no output (this runs both `tsc --noEmit` and the full-repo `eslint --max-warnings=0`, so it also catches any stray issue across all touched files).

- [ ] **Step 5: Manual smoke check (build + run once)**

Run: `cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter && bun run build`
Expected: build completes without errors, `dist/ccstatusline.js` is produced.

Run: `cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter && cat scripts/payload.example.json | bun start`
Expected: the tool runs and prints a status line without throwing (the new widget won't appear unless added to the example config, so this step just confirms nothing crashes on import/registration — the `rclone-queue` type is now a valid, loadable widget type).

- [ ] **Step 6: Commit**

```bash
cd /home/elhoim/ccstatusline/.claude/worktrees/rclone-dropbox-queue-counter
git add src/widgets/index.ts src/utils/widget-manifest.ts
git commit -m "feat(widgets): register rclone-queue widget"
```

If Step 3 above added a manifest test file change, include it in this commit instead of a separate one.

---

## Post-plan note (not a task — informational)

Once this lands, to actually see the widget in your own status line you'll add an `rclone-queue` item to your ccstatusline config via the normal in-TUI widget picker (category **Environment** → **RClone Queue**), then press `e` on it to set the remote name if it's not `dropbox`. No code changes are needed for that step — it's just using the feature.
