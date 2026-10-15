import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type MockInstance
} from 'vitest';

import { renderStatusLines } from '../render';
import type { RenderInvocation } from '../types/RenderContext';
import type { StatusJSON } from '../types/StatusJSON';
import type { LoadedSettings } from '../utils/config';
import {
    getConfigLoadError,
    loadSettingsFrom
} from '../utils/config';

// Byte parity for the #15 request-scoped render extraction: the golden bytes
// below were captured from the pre-refactor one-shot CLI (bun
// src/ccstatusline.ts < payload) with fixed fixtures, fixed env and a fixed
// terminal width. renderStatusLines must reproduce them byte-for-byte, since
// the entry point prints `text` with a single trailing newline.

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'render-parity');
const TRANSCRIPT_PATH = path.join(FIXTURES_DIR, 'transcript.jsonl');

// Exists on every platform and is not a git repository: git widgets fall back
// to "no git" and custom commands still inherit a valid working directory.
const NON_GIT_CWD = os.tmpdir();
// The cwd string carried in the golden payload (widgets print it verbatim).
const PAYLOAD_CWD = '/tmp/ccs-parity-fixture/project';

function payloadFor(): StatusJSON {
    return {
        model: { id: 'claude-sonnet-4-5', display_name: 'Sonnet 4.5' },
        session_id: 'parity-session-15',
        transcript_path: TRANSCRIPT_PATH,
        cwd: PAYLOAD_CWD,
        workspace: { current_dir: PAYLOAD_CWD },
        cost: {
            total_cost_usd: 1.25,
            total_duration_ms: 60000,
            total_api_duration_ms: 30000,
            total_lines_added: 10,
            total_lines_removed: 2
        },
        version: '2.1.0',
        output_style: { name: 'default' }
    };
}

const SCENARIOS: {
    name: string;
    colorLevel: number;
    width: number;
    extraSettings?: Record<string, unknown>;
    lines: { id: string; type: string; color?: string; customText?: string; bold?: boolean; dim?: boolean | 'parens'; merge?: boolean | 'no-padding'; backgroundColor?: string; commandPath?: string }[][];
}[] = [
    {
        name: 's1-basic',
        colorLevel: 2,
        width: 80,
        lines: [
            [{ id: '1', type: 'model', color: 'cyan' }, { id: '2', type: 'separator' }, { id: '3', type: 'tokens-total', color: 'brightBlack' }],
            [{ id: '4', type: 'context-percentage-usable', color: 'green' }, { id: '5', type: 'separator' }, { id: '6', type: 'current-working-dir', color: 'blue' }],
            [{ id: '7', type: 'version' }, { id: '8', type: 'separator' }, { id: '9', type: 'terminal-width' }]
        ]
    },
    {
        name: 's2-theme-truecolor',
        colorLevel: 3,
        width: 100,
        extraSettings: { powerline: { enabled: false, theme: 'dracula', continueThemeAcrossLines: true } },
        lines: [
            [{ id: '1', type: 'model' }, { id: '2', type: 'separator' }, { id: '3', type: 'context-length' }],
            [{ id: '4', type: 'custom-text', customText: 'THEME', color: 'red', bold: true }, { id: '5', type: 'separator' }, { id: '6', type: 'tokens-total' }]
        ]
    },
    {
        name: 's2b-gradient-truecolor',
        colorLevel: 3,
        width: 100,
        extraSettings: { overrideForegroundColor: 'gradient:hex:FF0000,hex:00FF00' },
        lines: [
            [{ id: '1', type: 'model' }, { id: '2', type: 'separator' }, { id: '3', type: 'context-length' }],
            [{ id: '4', type: 'custom-text', customText: 'GRADIENT-LINE' }, { id: '5', type: 'separator' }, { id: '6', type: 'tokens-total' }]
        ]
    },
    {
        name: 's3-ansi16-narrow',
        colorLevel: 1,
        width: 60,
        lines: [
            [{ id: '1', type: 'model', bold: true, color: 'red' }, { id: '2', type: 'custom-text', customText: 'dim-part', dim: true, merge: 'no-padding' }, { id: '3', type: 'context-percentage', dim: 'parens' }],
            [{ id: '4', type: 'custom-text', customText: 'BOX', color: 'white', backgroundColor: 'bgBlue' }]
        ]
    },
    {
        name: 's4-powerline',
        colorLevel: 2,
        width: 120,
        extraSettings: { powerline: { enabled: true, theme: 'nord', continueThemeAcrossLines: true } },
        lines: [
            [{ id: '1', type: 'model' }, { id: '2', type: 'flex-separator' }, { id: '3', type: 'context-length' }, { id: '4', type: 'flex-separator' }, { id: '5', type: 'tokens-total' }],
            [{ id: '6', type: 'custom-text', customText: 'PL' }, { id: '7', type: 'separator' }, { id: '8', type: 'git-branch' }]
        ]
    },
    {
        name: 's5-custom-command',
        colorLevel: 2,
        width: 90,
        lines: [
            [{ id: '1', type: 'custom-command', commandPath: 'echo parity-fixed-42', color: 'green' }, { id: '2', type: 'separator' }, { id: '3', type: 'model' }]
        ]
    }
];

async function renderWithSettings(
    configPath: string,
    settingsJson: Record<string, unknown>,
    width: number
): Promise<{ text: string; loaded: LoadedSettings }> {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(settingsJson), 'utf-8');
    const loaded = await loadSettingsFrom(configPath);
    const invocation: RenderInvocation = {
        configPath,
        cwd: NON_GIT_CWD,
        env: {},
        terminalWidth: width
    };
    const { text } = await renderStatusLines(payloadFor(), loaded, invocation);
    return { text: text + '\n', loaded };
}

describe('render parity vs pre-refactor CLI golden bytes', () => {
    let tmpDir: string;
    let cwdSpy: MockInstance<() => string>;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-parity-'));
        cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(NON_GIT_CWD);
    });

    afterEach(() => {
        cwdSpy.mockRestore();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it.each(SCENARIOS.map(s => [s.name, s]))(
        '%s renders byte-identical to the one-shot CLI',
        async (_name, scenario) => {
            const configPath = path.join(tmpDir, `${scenario.name}.json`);
            const { text } = await renderWithSettings(configPath, {
                version: 3,
                colorLevel: scenario.colorLevel,
                lines: scenario.lines,
                ...scenario.extraSettings
            }, scenario.width);
            const golden = fs.readFileSync(path.join(FIXTURES_DIR, `${scenario.name}.stdout.txt`), 'utf-8');
            expect(text).toBe(golden);
        }
    );

    it('malformed config keeps the warning badge and default layout byte-identical', async () => {
        const configPath = path.join(tmpDir, 's6-malformed-json.json');
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.writeFileSync(configPath, '{"version": 3, "lines": [BROKEN', 'utf-8');
        const loaded = await loadSettingsFrom(configPath);
        const { text } = await renderStatusLines(payloadFor(), loaded, {
            configPath,
            cwd: NON_GIT_CWD,
            env: {},
            terminalWidth: 80
        });
        const golden = fs.readFileSync(path.join(FIXTURES_DIR, 's6-malformed-json.stdout.txt'), 'utf-8');
        expect(text + '\n').toBe(golden);
    });

    it('updatemessage prints the message and persists the decremented count', async () => {
        const configPath = path.join(tmpDir, 's7-updatemessage.json');
        const { text } = await renderWithSettings(configPath, {
            version: 3,
            colorLevel: 2,
            updatemessage: { message: 'UPDATE-MESSAGE-PARITY', remaining: 5 },
            lines: [
                [{ id: '1', type: 'model', color: 'cyan' }],
                [{ id: '2', type: 'separator' }],
                []
            ]
        }, 80);
        const golden = fs.readFileSync(path.join(FIXTURES_DIR, 's7-updatemessage.stdout.txt'), 'utf-8');
        expect(text).toBe(golden);

        // The config write stayed inside this request's configPath and the
        // remaining count was decremented atomically.
        const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { updatemessage?: { remaining?: number } };
        expect(saved.updatemessage?.remaining).toBe(4);
    });

    it('emits no stdout and returns the text instead', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const configPath = path.join(tmpDir, 'no-stdout.json');
        const { text } = await renderWithSettings(configPath, {
            version: 3,
            colorLevel: 2,
            lines: [[{ id: '1', type: 'model', color: 'cyan' }]]
        }, 80);
        expect(logSpy).not.toHaveBeenCalled();
        expect(text.length).toBeGreaterThan(0);
        logSpy.mockRestore();
    });

    it('keeps per-request config loads isolated from module state', async () => {
        const good = path.join(tmpDir, 'good.json');
        const bad = path.join(tmpDir, 'bad.json');
        fs.writeFileSync(bad, 'not json at all', 'utf-8');
        fs.writeFileSync(good, JSON.stringify({
            version: 3,
            colorLevel: 2,
            lines: [[{ id: '1', type: 'model', color: 'cyan' }]]
        }), 'utf-8');

        const goodLoaded = await loadSettingsFrom(good);
        const badLoaded = await loadSettingsFrom(bad);

        // Each load reports its own outcome without touching module state.
        expect(goodLoaded.loadError).toBeNull();
        expect(badLoaded.loadError).toBe('settings.json is not valid JSON');
        expect(getConfigLoadError()).toBeNull();
    });
});
