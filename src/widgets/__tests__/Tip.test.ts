import * as fs from 'fs';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { createTipsTmpDir, makeTipFile, tipsSettings } from '../../test-helpers/tips';
import { resetTipRotationCache, writeTipFile } from '../../utils/tips';
import { TipWidget } from '../Tip';

let tmpDir: string;
let origCacheDir: string | undefined;

beforeEach(() => {
    tmpDir = createTipsTmpDir('tip-test-');
    origCacheDir = process.env.CCSTATUSLINE_CACHE_DIR;
    process.env.CCSTATUSLINE_CACHE_DIR = tmpDir;
    resetTipRotationCache();
});

afterEach(() => {
    if (origCacheDir === undefined) {
        delete process.env.CCSTATUSLINE_CACHE_DIR;
    } else {
        process.env.CCSTATUSLINE_CACHE_DIR = origCacheDir;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('TipWidget', () => {
    const widget = new TipWidget();
    const item: WidgetItem = { id: 'tip', type: 'tip' };
    const rawItem: WidgetItem = { id: 'tip', type: 'tip', rawValue: true };
    const hideItem: WidgetItem = { id: 'tip', type: 'tip', metadata: { hideWhenEmpty: 'true' } };
    const context: RenderContext = {};

    it('has correct metadata', () => {
        expect(widget.getCategory()).toBe('Session');
        expect(widget.getDefaultColor()).toBe('yellow');
        expect(widget.supportsRawValue()).toBe(true);
    });

    it('returns preview text in preview mode', () => {
        expect(widget.render(item, { isPreview: true }, DEFAULT_SETTINGS)).toBe('\uD83D\uDCA1 Use /help for available commands');
        expect(widget.render(rawItem, { isPreview: true }, DEFAULT_SETTINGS)).toBe('Use /help for available commands');
    });

    it('returns placeholder when no tip files exist and hideWhenEmpty is off', () => {
        const settings = tipsSettings(tmpDir);
        expect(widget.render(item, context, settings)).toBe('\uD83D\uDCA1 (no tips)');
        resetTipRotationCache();
        expect(widget.render(rawItem, context, settings)).toBe('(no tips)');
    });

    it('returns null when no tip files exist and hideWhenEmpty is on', () => {
        const settings = tipsSettings(tmpDir);
        expect(widget.render(hideItem, context, settings)).toBeNull();
    });

    it('renders tip with emoji prefix', () => {
        const settings = tipsSettings(tmpDir, { rotateEvery: 5, expiryDays: 30 });
        writeTipFile(makeTipFile('2.1.0', '2.0.0', ['tip one']), settings);
        expect(widget.render(item, context, settings)).toBe('\uD83D\uDCA1 tip one');
    });

    it('renders raw tip without emoji', () => {
        const settings = tipsSettings(tmpDir, { rotateEvery: 5, expiryDays: 30 });
        writeTipFile(makeTipFile('2.1.0', '2.0.0', ['tip one']), settings);
        expect(widget.render(rawItem, context, settings)).toBe('tip one');
    });

    it('toggles hide-when-empty metadata', () => {
        const base: WidgetItem = { id: 'tip', type: 'tip' };
        const hidden = widget.handleEditorAction!('toggle-hide-empty', base);
        expect(hidden?.metadata?.hideWhenEmpty).toBe('true');

        const shown = widget.handleEditorAction!('toggle-hide-empty', hidden!);
        expect(shown?.metadata?.hideWhenEmpty).toBe('false');
    });
});
