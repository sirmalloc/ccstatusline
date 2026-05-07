import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import * as config from '../../utils/config';
import { TotalCostWidget } from '../TotalCost';

function render(widget: TotalCostWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

const ITEM: WidgetItem = { id: '1', type: 'total-cost' };

describe('TotalCostWidget', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsl-totalcost-'));
        vi.spyOn(config, 'getConfigPath').mockReturnValue(path.join(tmpDir, 'settings.json'));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns preview value', () => {
        const widget = new TotalCostWidget();
        expect(render(widget, ITEM, { isPreview: true })).toBe('Total: $12.34');
    });

    it('returns raw preview value', () => {
        const widget = new TotalCostWidget();
        expect(render(widget, { ...ITEM, rawValue: true }, { isPreview: true })).toBe('$12.34');
    });

    it('returns null when no cost data and no persisted costs', () => {
        const widget = new TotalCostWidget();
        expect(render(widget, ITEM, { data: undefined })).toBeNull();
    });

    it('persists session cost and returns total', () => {
        const widget = new TotalCostWidget();
        const context: RenderContext = {
            data: { session_id: 'abc123', cost: { total_cost_usd: 2.5 } } as RenderContext['data']
        };
        const result = render(widget, ITEM, context);
        expect(result).toBe('Total: $2.50');

        const costsDir = path.join(tmpDir, 'costs');
        expect(fs.existsSync(path.join(costsDir, 'abc123'))).toBe(true);
        expect(fs.readFileSync(path.join(costsDir, 'abc123'), 'utf-8')).toBe('2.5');
    });

    it('sums costs across multiple sessions', () => {
        const costsDir = path.join(tmpDir, 'costs');
        fs.mkdirSync(costsDir, { recursive: true });
        fs.writeFileSync(path.join(costsDir, 'session1'), '1.5');
        fs.writeFileSync(path.join(costsDir, 'session2'), '3.25');

        const widget = new TotalCostWidget();
        expect(render(widget, ITEM, {})).toBe('Total: $4.75');
    });

    it('updates persisted cost on each render', () => {
        const widget = new TotalCostWidget();
        const context = (cost: number): RenderContext => ({
            data: { session_id: 'sess1', cost: { total_cost_usd: cost } } as RenderContext['data']
        });

        render(widget, ITEM, context(1.0));
        render(widget, ITEM, context(2.0));

        const costsDir = path.join(tmpDir, 'costs');
        expect(fs.readFileSync(path.join(costsDir, 'sess1'), 'utf-8')).toBe('2');
    });

    it('does not persist when cost is zero', () => {
        const widget = new TotalCostWidget();
        render(widget, ITEM, {
            data: { session_id: 'sess0', cost: { total_cost_usd: 0 } } as RenderContext['data']
        });
        const costsDir = path.join(tmpDir, 'costs');
        expect(fs.existsSync(path.join(costsDir, 'sess0'))).toBe(false);
    });

    it('returns raw total value without label', () => {
        const costsDir = path.join(tmpDir, 'costs');
        fs.mkdirSync(costsDir, { recursive: true });
        fs.writeFileSync(path.join(costsDir, 'session1'), '5.0');

        const widget = new TotalCostWidget();
        expect(render(widget, { ...ITEM, rawValue: true }, {})).toBe('$5.00');
    });

    it('sanitizes session id before using as filename', () => {
        const widget = new TotalCostWidget();
        const context: RenderContext = {
            data: { session_id: 'abc/../../etc/passwd', cost: { total_cost_usd: 1.0 } } as RenderContext['data']
        };
        render(widget, ITEM, context);
        const costsDir = path.join(tmpDir, 'costs');
        expect(fs.existsSync(path.join(costsDir, 'abcetcpasswd'))).toBe(true);
    });

    it('gracefully handles corrupted cost files', () => {
        const costsDir = path.join(tmpDir, 'costs');
        fs.mkdirSync(costsDir, { recursive: true });
        fs.writeFileSync(path.join(costsDir, 'good'), '2.0');
        fs.writeFileSync(path.join(costsDir, 'bad'), 'not-a-number');

        const widget = new TotalCostWidget();
        expect(render(widget, ITEM, {})).toBe('Total: $2.00');
    });
});
