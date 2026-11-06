import type { ChalkInstance } from 'chalk';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

export interface InkColors {
    chalk: ChalkInstance;
    restore: () => void;
}

// Ink styles text with its own copy of chalk, which picks a color level from
// the environment once, and tests run without a terminal, so Ink draws no
// styles at all. This turns colors on in the copy Ink loads, for tests that
// need to see where a style starts and ends, and returns that copy so they
// can build the codes Ink will draw.
export async function forceInkColors(): Promise<InkColors> {
    const inkChalkPath = createRequire(require.resolve('ink')).resolve('chalk');
    const { default: chalk } = await import(pathToFileURL(inkChalkPath).href) as { default: ChalkInstance };
    const originalLevel = chalk.level;
    chalk.level = 1;

    return {
        chalk,
        restore: () => {
            chalk.level = originalLevel;
        }
    };
}
