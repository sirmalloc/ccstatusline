import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type {
    RenderContext,
    RenderWakatimeData
} from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    WakatimeTodayWidget,
    formatDigitalAsHuman,
    formatWakatimeValue
} from '../WakatimeToday';

function makeItem(overrides: Partial<WidgetItem> = {}): WidgetItem {
    return {
        id: 'wakatime',
        type: 'wakatime-today',
        ...overrides
    };
}

function render(item: WidgetItem, context: RenderContext): string | null {
    return new WakatimeTodayWidget().render(item, context, DEFAULT_SETTINGS);
}

describe('formatDigitalAsHuman', () => {
    it('formats H:MM into HhMMm', () => {
        expect(formatDigitalAsHuman('6:25')).toBe('6h25m');
    });

    it('drops the leading hour when zero', () => {
        expect(formatDigitalAsHuman('0:42')).toBe('42m');
    });

    it('zero-pads minutes', () => {
        expect(formatDigitalAsHuman('1:05')).toBe('1h05m');
    });

    it('handles HH:MM:SS by ignoring seconds', () => {
        expect(formatDigitalAsHuman('1:06:25')).toBe('1h06m');
    });

    it('drops the leading hour when zero in HH:MM:SS form', () => {
        expect(formatDigitalAsHuman('0:42:10')).toBe('42m');
    });

    it('returns null for undefined input', () => {
        expect(formatDigitalAsHuman(undefined)).toBeNull();
    });

    it('returns the original string for unparseable input', () => {
        expect(formatDigitalAsHuman('not-a-time')).toBe('not-a-time');
    });
});

describe('formatWakatimeValue', () => {
    const data: RenderWakatimeData = {
        digital: '6:25',
        text: '6 hrs 25 mins',
        decimal: '6.42',
        totalSeconds: 23100
    };

    it('returns the human form by default', () => {
        expect(formatWakatimeValue(data, 'human')).toBe('6h25m');
    });

    it('returns the digital form unchanged', () => {
        expect(formatWakatimeValue(data, 'digital')).toBe('6:25');
    });

    it('returns the upstream text form', () => {
        expect(formatWakatimeValue(data, 'text')).toBe('6 hrs 25 mins');
    });

    it('appends an h to the decimal form', () => {
        expect(formatWakatimeValue(data, 'decimal')).toBe('6.42h');
    });
});

describe('WakatimeTodayWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders the labelled preview value in preview mode', () => {
        expect(render(makeItem(), { isPreview: true })).toBe('WK 6h25m');
    });

    it('renders the raw preview value when rawValue is enabled', () => {
        expect(render(makeItem({ rawValue: true }), { isPreview: true })).toBe('6h25m');
    });

    it('renders the human format when wakatime data is available', () => {
        const context: RenderContext = { wakatimeData: { digital: '6:25' } };
        expect(render(makeItem(), context)).toBe('WK 6h25m');
    });

    it('renders the configured digital format', () => {
        const context: RenderContext = { wakatimeData: { digital: '6:25' } };
        expect(render(makeItem({ metadata: { format: 'digital' } }), context)).toBe('WK 6:25');
    });

    it('renders the upstream text format when configured', () => {
        const context: RenderContext = { wakatimeData: { digital: '6:25', text: '6 hrs 25 mins' } };
        expect(render(makeItem({ metadata: { format: 'text' } }), context)).toBe('WK 6 hrs 25 mins');
    });

    it('honors the configured decimal format', () => {
        const context: RenderContext = { wakatimeData: { decimal: '6.42' } };
        expect(render(makeItem({ metadata: { format: 'decimal' } }), context)).toBe('WK 6.42h');
    });

    it('renders the WK - fallback when there is no wakatime data', () => {
        expect(render(makeItem(), {})).toBe('WK -');
    });

    it('returns null when hideWhenEmpty is set and there is no data', () => {
        expect(render(makeItem({ metadata: { hideWhenEmpty: 'true' } }), {})).toBeNull();
    });

    it('returns null when hideWhenEmpty is set and the api key is missing', () => {
        const context: RenderContext = { wakatimeData: { error: 'no-credentials' } };
        expect(render(makeItem({ metadata: { hideWhenEmpty: 'true' } }), context)).toBeNull();
    });

    it('renders the WK - fallback on api errors when hideWhenEmpty is off', () => {
        const context: RenderContext = { wakatimeData: { error: 'api-error' } };
        expect(render(makeItem(), context)).toBe('WK -');
    });

    it('uses a custom prefix when configured', () => {
        const context: RenderContext = { wakatimeData: { digital: '6:25' } };
        expect(render(makeItem({ metadata: { prefix: 'Wakatime: ' } }), context)).toBe('Wakatime: 6h25m');
    });

    it('omits the prefix entirely when configured to empty', () => {
        const context: RenderContext = { wakatimeData: { digital: '6:25' } };
        expect(render(makeItem({ metadata: { prefix: '' } }), context)).toBe('6h25m');
    });

    it('renders an OSC 8 link when the link toggle is on', () => {
        const context: RenderContext = { wakatimeData: { digital: '6:25' } };
        const output = render(makeItem({ metadata: { link: 'true' } }), context);
        expect(output).toContain('https://wakatime.com/dashboard');
        expect(output).toContain('WK 6h25m');
        expect(output).toContain('\x1b]8;;');
    });

    it('cycles formats via the editor action handler', () => {
        const widget = new WakatimeTodayWidget();
        const cycle = (current: WidgetItem): WidgetItem => {
            const next = widget.handleEditorAction('cycle-format', current);
            if (next === null) {
                throw new Error('expected cycle-format to return an updated item');
            }
            return next;
        };
        let item = makeItem();
        item = cycle(item);
        expect(item.metadata?.format).toBe('digital');
        item = cycle(item);
        expect(item.metadata?.format).toBe('text');
        item = cycle(item);
        expect(item.metadata?.format).toBe('decimal');
        item = cycle(item);
        expect(item.metadata?.format).toBe('human');
    });

    it('toggles hideWhenEmpty via the editor action handler', () => {
        const widget = new WakatimeTodayWidget();
        const toggled = widget.handleEditorAction('toggle-hide-empty', makeItem());
        expect(toggled).not.toBeNull();
        expect(toggled?.metadata?.hideWhenEmpty).toBe('true');
    });

    it('exposes the documented keybinds', () => {
        const keys = new WakatimeTodayWidget().getCustomKeybinds().map(k => k.key);
        expect(keys).toEqual(['f', 'p', 'h', 'l']);
    });
});
