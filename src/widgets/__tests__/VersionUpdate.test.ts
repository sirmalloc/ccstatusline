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
import { writeTipFile } from '../../utils/tips';
import { VersionUpdateWidget } from '../VersionUpdate';

let tmpDir: string;
let origCacheDir: string | undefined;

beforeEach(() => {
    tmpDir = createTipsTmpDir('vu-test-');
    origCacheDir = process.env.CCSTATUSLINE_CACHE_DIR;
    process.env.CCSTATUSLINE_CACHE_DIR = tmpDir;
});

afterEach(() => {
    if (origCacheDir === undefined) {
        delete process.env.CCSTATUSLINE_CACHE_DIR;
    } else {
        process.env.CCSTATUSLINE_CACHE_DIR = origCacheDir;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('VersionUpdateWidget', () => {
    const widget = new VersionUpdateWidget();
    const item: WidgetItem = { id: 'vu', type: 'version-update' };
    const rawItem: WidgetItem = { id: 'vu', type: 'version-update', rawValue: true };
    const context: RenderContext = {};

    it('has correct metadata', () => {
        expect(widget.getCategory()).toBe('Session');
        expect(widget.getDefaultColor()).toBe('green');
        expect(widget.supportsRawValue()).toBe(true);
    });

    it('returns preview text in preview mode', () => {
        expect(widget.render(item, { isPreview: true }, DEFAULT_SETTINGS)).toBe('Tips: v1.0.0 \u2192 v2.0.0');
        expect(widget.render(rawItem, { isPreview: true }, DEFAULT_SETTINGS)).toBe('v1.0.0 \u2192 v2.0.0');
    });

    it('returns null when no tip files exist', () => {
        const settings = tipsSettings(tmpDir);
        expect(widget.render(item, context, settings)).toBeNull();
    });

    it('shows single version when one tip file exists', () => {
        const settings = tipsSettings(tmpDir, { expiryDays: 30 });
        writeTipFile(makeTipFile('2.1.0', '2.0.0', ['tip1']), settings);
        expect(widget.render(item, context, settings)).toBe('Tips: v2.1.0');
    });

    it('renders raw value without prefix', () => {
        const settings = tipsSettings(tmpDir, { expiryDays: 30 });
        writeTipFile(makeTipFile('2.1.0', '2.0.0', ['tip1']), settings);
        expect(widget.render(rawItem, context, settings)).toBe('v2.1.0');
    });

    it('shows range when multiple tip files exist', () => {
        const settings = tipsSettings(tmpDir, { expiryDays: 30 });
        writeTipFile(makeTipFile('2.1.0', '2.0.0', ['a']), settings);
        writeTipFile(makeTipFile('2.3.0', '2.2.0', ['b']), settings);
        writeTipFile(makeTipFile('2.2.0', '2.1.0', ['c']), settings);
        expect(widget.render(item, context, settings)).toBe('Tips: v2.1.0 \u2192 v2.3.0');
        expect(widget.render(rawItem, context, settings)).toBe('v2.1.0 \u2192 v2.3.0');
    });

    it('returns null when all files are expired', () => {
        const settings = tipsSettings(tmpDir, { expiryDays: 7 });
        writeTipFile(makeTipFile('2.1.0', '2.0.0', ['tip1'], 10), settings);
        expect(widget.render(item, context, settings)).toBeNull();
    });
});
