import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { TipFile } from '../types/TipData';
import { DEFAULT_SETTINGS, type Settings } from '../types/Settings';

export function createTipsTmpDir(prefix: string): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function tipsSettings(tmpDir: string, overrides: Partial<Settings['tips']> = {}): Settings {
    return {
        ...DEFAULT_SETTINGS,
        tips: {
            ...DEFAULT_SETTINGS.tips,
            tipDir: path.join(tmpDir, 'tips'),
            ...overrides
        }
    };
}

export function makeTipFile(version: string, previousVersion: string, tips: string[], daysAgo = 0): TipFile {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return {
        version,
        previousVersion,
        generatedAt: date.toISOString(),
        tips
    };
}
