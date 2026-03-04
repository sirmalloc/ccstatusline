import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { SessionClockWidget } from '../SessionClock';

function render(item: WidgetItem, context: RenderContext = {}): string | null {
    const widget = new SessionClockWidget();
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('SessionClockWidget', () => {
    it('uses cost.total_duration_ms when available', () => {
        expect(render(
            { id: 'session-clock', type: 'session-clock' },
            { data: { cost: { total_duration_ms: 2 * 60 * 60 * 1000 + 15 * 60 * 1000 } } }
        )).toBe('Session: 2hr 15m');
    });

    it('supports raw value with cost.total_duration_ms', () => {
        expect(render(
            { id: 'session-clock', type: 'session-clock', rawValue: true },
            { data: { cost: { total_duration_ms: 30 * 1000 } } }
        )).toBe('<1m');
    });

    it('falls back to sessionDuration when status JSON duration is missing', () => {
        expect(render(
            { id: 'session-clock', type: 'session-clock' },
            { sessionDuration: '3hr 20m' }
        )).toBe('Session: 3hr 20m');
    });
});