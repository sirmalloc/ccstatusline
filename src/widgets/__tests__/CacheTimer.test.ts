import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { CacheTimerWidget } from '../CacheTimer';

const item = (extra: Partial<WidgetItem> = {}): WidgetItem => ({ id: 'cache-timer', type: 'cache-timer', ...extra });
const hidden: Partial<WidgetItem> = { metadata: { hideWhenEmpty: 'true' } };

const isoAgo = (seconds: number): string => new Date(Date.now() - seconds * 1000).toISOString();
const assistant = (seconds: number): string => JSON.stringify({ type: 'assistant', timestamp: isoAgo(seconds) });
const pendingUser = JSON.stringify({ type: 'user' });

describe('CacheTimer widget', () => {
    let tmpDir: string;
    let fileCounter = 0;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-cache-timer-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const transcriptContext = (lines: string[]): RenderContext => {
        const file = path.join(tmpDir, `transcript-${++fileCounter}.jsonl`);
        fs.writeFileSync(file, lines.join('\n'), 'utf8');
        return { data: { transcript_path: file } };
    };

    it('renders the preview as a labeled or raw sample', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item(), { isPreview: true }, DEFAULT_SETTINGS)).toBe('Cache: 🟢 4:52');
        expect(widget.render(item({ rawValue: true }), { isPreview: true }, DEFAULT_SETTINGS)).toBe('🟢 4:52');
    });

    it('renders n/a when no transcript is available by default', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item(), {}, DEFAULT_SETTINGS)).toBe('Cache: n/a');
        expect(widget.render(item({ rawValue: true }), {}, DEFAULT_SETTINGS)).toBe('n/a');
    });

    it('hides the widget when there is no data and hide-when-empty is enabled', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item(hidden), {}, DEFAULT_SETTINGS)).toBeNull();
        expect(widget.render(item(hidden), transcriptContext([]), DEFAULT_SETTINGS)).toBeNull();
    });

    it('renders n/a for an empty transcript by default', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item(), transcriptContext([]), DEFAULT_SETTINGS)).toBe('Cache: n/a');
    });

    it('shows HOT while a turn is in flight, regardless of hide-when-empty', () => {
        const widget = new CacheTimerWidget();
        const context = transcriptContext([assistant(60), pendingUser]);
        expect(widget.render(item(), context, DEFAULT_SETTINGS)).toBe('Cache: 🔥 HOT');
        expect(widget.render(item(hidden), context, DEFAULT_SETTINGS)).toBe('Cache: 🔥 HOT');
    });

    const buckets = [
        { label: 'fresh', elapsed: 10, icon: '🟢' },
        { label: 'draining', elapsed: 180, icon: '🟡' },
        { label: 'almost cold', elapsed: 260, icon: '🔴' }
    ];
    for (const { label, elapsed, icon } of buckets) {
        it(`renders the ${label} countdown with the ${icon} icon`, () => {
            const widget = new CacheTimerWidget();
            const out = widget.render(item(), transcriptContext([assistant(elapsed)]), DEFAULT_SETTINGS);
            expect(out).toMatch(new RegExp(`^Cache: ${icon} \\d+:\\d{2}$`));
        });
    }

    it('renders COLD once the TTL has elapsed', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item(), transcriptContext([assistant(400)]), DEFAULT_SETTINGS)).toBe('Cache: ❄️ COLD');
    });

    it('renders a raw countdown without the label', () => {
        const widget = new CacheTimerWidget();
        const out = widget.render(item({ rawValue: true }), transcriptContext([assistant(10)]), DEFAULT_SETTINGS);
        expect(out).toMatch(/^🟢 \d+:\d{2}$/);
    });

    it('treats a malformed assistant timestamp as no data instead of rendering NaN', () => {
        const widget = new CacheTimerWidget();
        const context = transcriptContext([JSON.stringify({ type: 'assistant', timestamp: 'not-a-date' })]);
        expect(widget.render(item(), context, DEFAULT_SETTINGS)).toBe('Cache: n/a');
        expect(widget.render(item(hidden), context, DEFAULT_SETTINGS)).toBeNull();
    });

    it('exposes a hide-when-empty keybind and toggles the flag', () => {
        const widget = new CacheTimerWidget();
        expect(widget.getCustomKeybinds()).toEqual([
            { key: 't', label: '(t)tl', action: 'toggle-ttl' },
            { key: 'h', label: '(h)ide when empty', action: 'toggle-hide' },
            { key: 'g', label: '(g)lyph', action: 'edit-symbol-override' }
        ]);
        expect(widget.handleEditorAction('toggle-hide', item())?.metadata?.hideWhenEmpty).toBe('true');
        expect(widget.handleEditorAction('unknown', item())).toBeNull();
    });

    it('annotates the editor only when hide-when-empty is enabled', () => {
        const widget = new CacheTimerWidget();
        expect(widget.getEditorDisplay(item()).displayText).toBe('Cache Timer');
        expect(widget.getEditorDisplay(item()).modifierText).toBeUndefined();
        expect(widget.getEditorDisplay(item(hidden)).modifierText).toBe('(hide when empty)');
    });

    it('renders custom state glyphs from metadata overrides', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item({ metadata: { symbolCold: 'X' } }), transcriptContext([assistant(400)]), DEFAULT_SETTINGS)).toBe('Cache: X COLD');
        expect(widget.render(item({ metadata: { symbolFresh: '*' } }), transcriptContext([assistant(10)]), DEFAULT_SETTINGS)).toMatch(/^Cache: \* \d+:\d{2}$/);
        expect(widget.render(item({ metadata: { symbolHot: '>' } }), transcriptContext([assistant(60), pendingUser]), DEFAULT_SETTINGS)).toBe('Cache: > HOT');
    });

    it('drops the glyph and its space when an override is blanked', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item({ metadata: { symbolFresh: '' } }), transcriptContext([assistant(10)]), DEFAULT_SETTINGS)).toMatch(/^Cache: \d+:\d{2}$/);
    });

    it('reflects a custom fresh glyph in the preview', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item({ metadata: { symbolFresh: '#' } }), { isPreview: true }, DEFAULT_SETTINGS)).toBe('Cache: # 4:52');
    });

    it('extends the countdown window when the TTL is set to 1 hour', () => {
        const widget = new CacheTimerWidget();
        // 600s in is COLD at the default 5-minute TTL...
        expect(widget.render(item(), transcriptContext([assistant(600)]), DEFAULT_SETTINGS)).toBe('Cache: ❄️ COLD');
        // ...but still fresh under a 1-hour TTL.
        expect(widget.render(item({ metadata: { ttlSeconds: '3600' } }), transcriptContext([assistant(600)]), DEFAULT_SETTINGS)).toMatch(/^Cache: 🟢 \d+:\d{2}$/);
    });

    it('falls back to the default TTL for a malformed value', () => {
        const widget = new CacheTimerWidget();
        expect(widget.render(item({ metadata: { ttlSeconds: 'abc' } }), transcriptContext([assistant(600)]), DEFAULT_SETTINGS)).toBe('Cache: ❄️ COLD');
    });

    it('cycles the TTL between 5m and 1h via the keybind', () => {
        const widget = new CacheTimerWidget();
        const toOneHour = widget.handleEditorAction('toggle-ttl', item());
        expect(toOneHour?.metadata?.ttlSeconds).toBe('3600');
        const backToDefault = widget.handleEditorAction('toggle-ttl', toOneHour ?? item());
        expect(backToDefault?.metadata?.ttlSeconds).toBeUndefined();
    });

    it('annotates the editor with a non-default TTL', () => {
        const widget = new CacheTimerWidget();
        expect(widget.getEditorDisplay(item({ metadata: { ttlSeconds: '3600' } })).modifierText).toBe('(ttl 1h)');
        expect(widget.getEditorDisplay(item({ metadata: { ttlSeconds: '3600', hideWhenEmpty: 'true' } })).modifierText).toBe('(ttl 1h, hide when empty)');
    });
});
