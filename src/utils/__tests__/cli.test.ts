import * as fs from 'fs';
import path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type MockInstance
} from 'vitest';

import { CURRENT_VERSION } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    executeCli,
    extractJsonFlag,
    formatCliResult,
    isCliMode
} from '../cli';
import { initConfigPath } from '../config';

const MOCK_HOME_DIR = '/tmp/ccstatusline-cli-test-home';
const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;

let consoleErrorSpy: MockInstance<typeof console.error>;

interface DiskConfig {
    version?: number;
    lines?: WidgetItem[][];
    compactThreshold?: number;
    flexMode?: string;
    powerline?: { enabled?: boolean };
    numberFormat?: { token?: { style?: string } };
}

function getSettingsPaths(): { configDir: string; settingsPath: string } {
    const configDir = path.join(MOCK_HOME_DIR, '.config', 'ccstatusline');
    return {
        configDir,
        settingsPath: path.join(configDir, 'settings.json')
    };
}

function getClaudeConfigDir(): string {
    return path.join(MOCK_HOME_DIR, '.claude');
}

function readDisk(): DiskConfig {
    return JSON.parse(fs.readFileSync(getSettingsPaths().settingsPath, 'utf-8')) as DiskConfig;
}

function readDiskRaw(): string {
    return fs.readFileSync(getSettingsPaths().settingsPath, 'utf-8');
}

function writeDisk(content: string): void {
    fs.mkdirSync(getSettingsPaths().configDir, { recursive: true });
    fs.writeFileSync(getSettingsPaths().settingsPath, content, 'utf-8');
}

function lineTypes(config: DiskConfig, line: number): string[] {
    return (config.lines ?? [])[line]?.map(item => item.type) ?? [];
}

describe('cli commands', () => {
    beforeEach(() => {
        fs.rmSync(MOCK_HOME_DIR, { recursive: true, force: true });
        process.env.CLAUDE_CONFIG_DIR = getClaudeConfigDir();
        initConfigPath(getSettingsPaths().settingsPath);
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        if (ORIGINAL_CLAUDE_CONFIG_DIR === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR;
        } else {
            process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CLAUDE_CONFIG_DIR;
        }
        initConfigPath();
        fs.rmSync(MOCK_HOME_DIR, { recursive: true, force: true });
    });

    describe('mode detection', () => {
        it('enters cli mode only with args and a TTY stdin', () => {
            expect(isCliMode(['get'], true)).toBe(true);
            expect(isCliMode([], true)).toBe(false);
            expect(isCliMode(['get'], false)).toBe(false);
        });
    });

    describe('get', () => {
        it('prints the effective post-migration config on first run', async () => {
            const result = await executeCli(['get']);

            expect(result.exitCode).toBe(0);
            const parsed = JSON.parse(result.message ?? '') as DiskConfig;
            expect(parsed.version).toBe(CURRENT_VERSION);
            expect(parsed.lines).toHaveLength(3);
            expect(lineTypes(parsed, 0)).toContain('git-branch');
        });

        it('fails with a single-line error on an invalid config', async () => {
            writeDisk('{not json');

            const result = await executeCli(['get']);

            expect(result.exitCode).toBe(1);
            expect(result.message).not.toContain('\n');
            expect(result.message).toContain('invalid');
            expect(readDiskRaw()).toBe('{not json');
        });
    });

    describe('widget add', () => {
        it('appends a widget with a generated id and persists it', async () => {
            const result = await executeCli(['widget', 'add', '0', 'tokens-total']);

            expect(result.exitCode).toBe(0);
            const disk = readDisk();
            const added = (disk.lines ?? [])[0]?.at(-1);
            expect(added?.type).toBe('tokens-total');
            expect(added?.id).toBeTruthy();
            expect(lineTypes(disk, 0)[0]).toBe('model');
        });

        it('inserts at --index when given', async () => {
            const result = await executeCli(['widget', 'add', '0', 'tokens-total', '--index', '0']);

            expect(result.exitCode).toBe(0);
            expect(lineTypes(readDisk(), 0)[0]).toBe('tokens-total');
        });

        it('applies typed options to the new widget', async () => {
            const result = await executeCli([
                'widget', 'add', '1', 'custom-text',
                '--customText', 'hello', '--color', 'red', '--bold', '--maxWidth', '12'
            ]);

            expect(result.exitCode).toBe(0);
            const added = (readDisk().lines ?? [])[1]?.[0];
            expect(added?.customText).toBe('hello');
            expect(added?.color).toBe('red');
            expect(added?.bold).toBe(true);
            expect(added?.maxWidth).toBe(12);
        });

        it('stores --metadata key=value pairs', async () => {
            const result = await executeCli([
                'widget', 'add', '0', 'git-changes', '--metadata', 'hide=no-git,zero'
            ]);

            expect(result.exitCode).toBe(0);
            const added = (readDisk().lines ?? [])[0]?.at(-1);
            expect(added?.metadata?.hide).toBe('no-git,zero');
        });

        it('rejects an unknown widget type without touching the file', async () => {
            writeDisk(JSON.stringify({ version: CURRENT_VERSION }));
            const before = readDiskRaw();

            const result = await executeCli(['widget', 'add', '0', 'not-a-widget']);

            expect(result.exitCode).toBe(1);
            expect(result.message).toContain('unknown widget type \'not-a-widget\'');
            expect(readDiskRaw()).toBe(before);
        });

        it('rejects an unknown option', async () => {
            const result = await executeCli(['widget', 'add', '0', 'model', '--bogus', 'x']);

            expect(result.exitCode).toBe(1);
            expect(result.message).toContain('unknown widget option \'--bogus\'');
        });

        it('rejects a non-numeric value for a number option', async () => {
            const result = await executeCli(['widget', 'add', '0', 'model', '--maxWidth', 'abc']);

            expect(result.exitCode).toBe(1);
            expect(result.message).toContain('--maxWidth expects a number');
        });

        it('rejects an out-of-range line index', async () => {
            const result = await executeCli(['widget', 'add', '5', 'model']);

            expect(result.exitCode).toBe(1);
            expect(result.message).toContain('line index 5 out of range');
        });

        it('rejects an out-of-range --index', async () => {
            const result = await executeCli(['widget', 'add', '0', 'model', '--index', '99']);

            expect(result.exitCode).toBe(1);
            expect(result.message).toContain('--index 99 out of range');
        });
    });

    describe('widget remove', () => {
        it('removes by index', async () => {
            const result = await executeCli(['widget', 'remove', '0', '1']);

            expect(result.exitCode).toBe(0);
            // Default line 0 index 1 is the first separator.
            expect(lineTypes(readDisk(), 0)).toEqual([
                'model', 'context-length', 'separator', 'git-branch', 'separator', 'git-changes'
            ]);
        });

        it('removes the first match when removing by type', async () => {
            await executeCli(['widget', 'add', '0', 'git-branch']);
            const result = await executeCli(['widget', 'remove', '0', 'git-branch']);

            expect(result.exitCode).toBe(0);
            expect(lineTypes(readDisk(), 0).filter(type => type === 'git-branch')).toHaveLength(1);
        });

        it('errors once no matching widget remains (not idempotent-by-type)', async () => {
            await executeCli(['widget', 'remove', '0', 'git-branch']);
            const result = await executeCli(['widget', 'remove', '0', 'git-branch']);

            expect(result.exitCode).toBe(1);
            expect(result.message).toContain('no widget of type \'git-branch\'');
        });

        it('errors on an out-of-range index', async () => {
            const result = await executeCli(['widget', 'remove', '0', '99']);

            expect(result.exitCode).toBe(1);
            expect(result.message).toContain('index 99 out of range');
        });
    });

    describe('widget move', () => {
        it('moves a widget within a line', async () => {
            const result = await executeCli(['widget', 'move', '0', '0', '--to', '2']);

            expect(result.exitCode).toBe(0);
            expect(lineTypes(readDisk(), 0)).toEqual([
                'separator', 'context-length', 'model', 'separator', 'git-branch', 'separator', 'git-changes'
            ]);
        });

        it('is a no-op success when source and target match', async () => {
            await executeCli(['get']);
            const before = readDiskRaw();
            const result = await executeCli(['widget', 'move', '0', '1', '--to', '1']);

            expect(result.exitCode).toBe(0);
            expect(readDiskRaw()).toBe(before);
        });

        it('errors without --to', async () => {
            const result = await executeCli(['widget', 'move', '0', '0']);

            expect(result.exitCode).toBe(1);
            expect(result.message).toContain('requires --to');
        });

        it('errors on out-of-range source and target', async () => {
            const fromResult = await executeCli(['widget', 'move', '0', '99', '--to', '0']);
            const toResult = await executeCli(['widget', 'move', '0', '0', '--to', '99']);

            expect(fromResult.exitCode).toBe(1);
            expect(fromResult.message).toContain('index 99 out of range');
            expect(toResult.exitCode).toBe(1);
            expect(toResult.message).toContain('--to 99 out of range');
        });
    });

    describe('set', () => {
        it('sets a scalar global option and is idempotent', async () => {
            const first = await executeCli(['set', 'compactThreshold', '40']);
            const before = readDiskRaw();
            const second = await executeCli(['set', 'compactThreshold', '40']);

            expect(first.exitCode).toBe(0);
            expect(second.exitCode).toBe(0);
            expect(readDiskRaw()).toBe(before);
            expect(readDisk().compactThreshold).toBe(40);
        });

        it('sets a nested option', async () => {
            const result = await executeCli(['set', 'powerline.enabled', 'true']);

            expect(result.exitCode).toBe(0);
            expect(readDisk().powerline?.enabled).toBe(true);
        });

        it('creates an absent optional top-level object from JSON', async () => {
            const result = await executeCli(['set', 'numberFormat', '{"token":{"style":"compact"}}']);

            expect(result.exitCode).toBe(0);
            expect(readDisk().numberFormat?.token?.style).toBe('compact');
        });

        it('rejects a value that makes the config invalid, writing nothing', async () => {
            writeDisk(JSON.stringify({ version: CURRENT_VERSION }));
            const before = readDiskRaw();

            const result = await executeCli(['set', 'compactThreshold', '200']);

            expect(result.exitCode).toBe(1);
            expect(result.message).toContain('nothing was written');
            expect(readDiskRaw()).toBe(before);
        });

        it('rejects unknown option paths', async () => {
            const topResult = await executeCli(['set', 'bogusTop', 'x']);
            const nestedResult = await executeCli(['set', 'powerline.bogus', 'x']);

            expect(topResult.exitCode).toBe(1);
            expect(topResult.message).toContain('unknown option \'bogusTop\'');
            expect(nestedResult.exitCode).toBe(1);
            expect(nestedResult.message).toContain('unknown option \'powerline.bogus\'');
        });

        it('rejects inherited Object.prototype keys instead of stripping them silently', async () => {
            writeDisk(JSON.stringify({ version: CURRENT_VERSION }));
            const before = readDiskRaw();

            const toStringResult = await executeCli(['set', 'toString', 'x']);
            const ctorResult = await executeCli(['set', 'powerline.constructor', 'x']);

            expect(toStringResult.exitCode).toBe(1);
            expect(toStringResult.message).toContain('unknown option \'toString\'');
            expect(ctorResult.exitCode).toBe(1);
            expect(ctorResult.message).toContain('unknown option \'powerline.constructor\'');
            expect(readDiskRaw()).toBe(before);
        });

        it('warns on an unknown theme but still writes it', async () => {
            const result = await executeCli(['set', 'theme', 'not-a-theme']);

            expect(result.exitCode).toBe(0);
            expect(result.message).toContain('warning');
            expect((result.data as { warnings: string[] }).warnings[0]).toContain('unknown theme');
            expect((readDisk() as { theme?: string }).theme).toBe('not-a-theme');
        });

        it('does not warn for a known theme', async () => {
            const result = await executeCli(['set', 'theme', 'dracula']);

            expect(result.exitCode).toBe(0);
            expect(result.message).not.toContain('warning');
            expect((result.data as { warnings: string[] }).warnings).toHaveLength(0);
            expect((readDisk() as { theme?: string }).theme).toBe('dracula');
        });
    });

    describe('validate', () => {
        it('reports valid for the live config and invalid for a corrupt one', async () => {
            const valid = await executeCli(['validate']);

            expect(valid.exitCode).toBe(0);
            expect(valid.data).toMatchObject({ valid: true, path: getSettingsPaths().settingsPath });

            writeDisk('{"lines": "bogus", "version": 4}');
            const invalid = await executeCli(['validate']);

            expect(invalid.exitCode).toBe(1);
            expect(invalid.data).toMatchObject({ valid: false });
            expect((invalid.data as { errors: string[] }).errors.length).toBeGreaterThan(0);
        });

        it('never overwrites an invalid config while validating it', async () => {
            writeDisk('{broken');

            await executeCli(['validate']);

            expect(readDiskRaw()).toBe('{broken');
        });

        it('validates an external file via --file', async () => {
            const goodPath = path.join(getSettingsPaths().configDir, 'good.json');
            const badPath = path.join(getSettingsPaths().configDir, 'bad.json');
            fs.mkdirSync(getSettingsPaths().configDir, { recursive: true });
            fs.writeFileSync(goodPath, JSON.stringify({ version: CURRENT_VERSION }), 'utf-8');
            fs.writeFileSync(badPath, JSON.stringify({ version: CURRENT_VERSION + 95 }), 'utf-8');

            const good = await executeCli(['validate', '--file', goodPath]);
            const bad = await executeCli(['validate', '--file', badPath]);
            const missing = await executeCli(['validate', '--file', path.join(getSettingsPaths().configDir, 'nope.json')]);

            expect(good.exitCode).toBe(0);
            expect(good.data).toMatchObject({ valid: true, path: goodPath });
            expect(bad.exitCode).toBe(1);
            expect((bad.data as { errors: string[] }).errors[0]).toContain('newer than supported');
            expect(missing.exitCode).toBe(1);
            expect(missing.message).toContain('Cannot read file');
        });

        it('warns on an unknown theme name while staying valid', async () => {
            writeDisk(JSON.stringify({ version: CURRENT_VERSION, theme: 'not-a-theme' }));

            const result = await executeCli(['validate']);

            expect(result.exitCode).toBe(0);
            expect(result.message).toContain('with warnings');
            expect((result.data as { warnings: string[] }).warnings[0]).toContain('unknown theme');
        });

        it('reports no theme warnings when the theme is known', async () => {
            writeDisk(JSON.stringify({ version: CURRENT_VERSION, theme: 'nord' }));

            const result = await executeCli(['validate']);

            expect(result.exitCode).toBe(0);
            expect((result.data as { warnings: string[] }).warnings).toHaveLength(0);
        });
    });

    describe('safety guarantees', () => {
        it('refuses mutations while the on-disk config is invalid', async () => {
            writeDisk('{not json');
            const before = readDiskRaw();

            const result = await executeCli(['widget', 'add', '0', 'model']);

            expect(result.exitCode).toBe(1);
            expect(result.message).toContain('refusing to modify invalid config');
            expect(readDiskRaw()).toBe(before);
        });

        it('writes through a symlinked settings file without replacing the link', async () => {
            const realDir = path.join(MOCK_HOME_DIR, 'real-config');
            const realPath = path.join(realDir, 'real-settings.json');
            fs.mkdirSync(realDir, { recursive: true });
            fs.writeFileSync(realPath, JSON.stringify({ version: CURRENT_VERSION }), 'utf-8');
            fs.mkdirSync(getSettingsPaths().configDir, { recursive: true });
            fs.symlinkSync(realPath, getSettingsPaths().settingsPath);

            const result = await executeCli(['widget', 'add', '0', 'tokens-total']);

            expect(result.exitCode).toBe(0);
            expect(fs.lstatSync(getSettingsPaths().settingsPath).isSymbolicLink()).toBe(true);
            const onReal = JSON.parse(fs.readFileSync(realPath, 'utf-8')) as DiskConfig;
            expect(lineTypes(onReal, 0).at(-1)).toBe('tokens-total');
        });
    });

    describe('help and usage errors', () => {
        it('prints usage for help and unknown commands', async () => {
            const help = await executeCli(['help']);
            const unknown = await executeCli(['bogus']);
            const unknownWidget = await executeCli(['widget', 'rename']);

            expect(help.exitCode).toBe(0);
            expect(help.message).toContain('usage: ccstatusline');
            expect(help.message).toContain('write the default config on first run');
            expect(unknown.exitCode).toBe(1);
            expect(unknown.message).toContain('unknown command \'bogus\'');
            expect(unknownWidget.exitCode).toBe(1);
            expect(unknownWidget.message).toContain('unknown widget command \'rename\'');
        });
    });

    describe('output formatting', () => {
        it('emits single-line machine-parseable errors', () => {
            const text = formatCliResult({ exitCode: 1, message: 'boom\ngone  bad' }, false);
            const json = formatCliResult({ exitCode: 1, message: 'boom\ngone  bad' }, true);

            expect(text.stream).toBe('stderr');
            expect(text.text).toBe('Error: boom gone bad');
            expect(json.stream).toBe('stdout');
            expect(json.text).toBe('{"error":"boom gone bad"}');
        });

        it('emits the data payload as one JSON line in --json success mode', () => {
            const json = formatCliResult({ exitCode: 0, message: 'added x', data: { added: true, type: 'x' } }, true);

            expect(json.text).toBe('{"added":true,"type":"x"}');
        });

        it('treats --json as the output flag only when it does not fill an option value', () => {
            expect(extractJsonFlag(['get', '--json'])).toEqual({ args: ['get'], json: true });
            expect(extractJsonFlag(['--json', 'get'])).toEqual({ args: ['get'], json: true });
            expect(extractJsonFlag(['get'])).toEqual({ args: ['get'], json: false });

            // A --json token after a value-taking option is that option's value.
            expect(extractJsonFlag(['widget', 'add', '0', 'custom-text', '--customText', '--json'])).toEqual({
                args: ['widget', 'add', '0', 'custom-text', '--customText', '--json'],
                json: false
            });

            // A boolean flag followed by a non-`--` token consumes it as the value.
            expect(extractJsonFlag(['widget', 'add', '0', 'model', '--bold', 'false', '--json'])).toEqual({
                args: ['widget', 'add', '0', 'model', '--bold', 'false'],
                json: true
            });
        });

        it('keeps a --json-looking option value intact for widget add', async () => {
            const result = await executeCli(['widget', 'add', '1', 'custom-text', '--customText', '--json']);

            expect(result.exitCode).toBe(0);
            const added = (readDisk().lines ?? [])[1]?.[0];
            expect(added?.customText).toBe('--json');
        });
    });

    describe('end-to-end round trip', () => {
        it('get -> widget add -> validate -> get --json keeps a consistent config', async () => {
            const initial = await executeCli(['get']);
            const add = await executeCli(['widget', 'add', '0', 'custom-text', '--customText', 'demo', '--index', '0']);
            const validate = await executeCli(['validate']);
            const final = await executeCli(['get', '--json']);

            expect(initial.exitCode).toBe(0);
            expect(add.exitCode).toBe(0);
            expect(validate.exitCode).toBe(0);
            expect(final.exitCode).toBe(0);

            const formatted = formatCliResult(final, true);
            expect(formatted.text).not.toContain('\n');
            const parsed = JSON.parse(formatted.text) as DiskConfig;
            expect(parsed.version).toBe(CURRENT_VERSION);
            expect((parsed.lines ?? [])[0]?.[0]?.type).toBe('custom-text');
            expect(lineTypes(readDisk(), 0)[0]).toBe('custom-text');
        });
    });
});
