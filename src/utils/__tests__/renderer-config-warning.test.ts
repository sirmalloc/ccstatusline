import chalk from 'chalk';
import {
    afterEach,
    describe,
    expect,
    it
} from 'vitest';

import { updateColorMap } from '../colors';
import { buildConfigWarningBadge } from '../renderer';

describe('buildConfigWarningBadge', () => {
    const originalLevel = chalk.level;

    afterEach(() => {
        chalk.level = originalLevel;
        updateColorMap();
    });

    it('returns plain text with no ANSI escapes when colorLevel is 0', () => {
        chalk.level = 0;
        updateColorMap();
        const result = buildConfigWarningBadge(0);
        expect(result).toBe('⚠ invalid config');
        expect(result).not.toContain('\x1b');
    });

    it('contains the text and ANSI escapes when colorLevel is 2', () => {
        chalk.level = 2;
        updateColorMap();
        const result = buildConfigWarningBadge(2);
        expect(result).toContain('invalid config');
        expect(result).toContain('\x1b');
    });
});
