import type { Settings } from '../types/Settings';
import { SettingsSchema } from '../types/Settings';
import type { WidgetItem } from '../types/Widget';
import { WidgetItemSchema } from '../types/Widget';

import { getPowerlineThemes } from './colors';

import {
    getConfigLoadError,
    getConfigPath,
    loadSettings,
    saveSettings,
    validateImportFile
} from './config';
import { generateGuid } from './guid';
import {
    getAllWidgetTypes,
    resolveLegacyWidgetType
} from './widgets';

// Non-interactive CLI (#602): lets coding agents read and mutate the same
// settings.json the TUI edits. All mutations load via loadSettings(), refuse to
// run on an unreadable/invalid config, validate the resulting config before any
// write, and persist through saveSettings() (atomic rename, symlink
// write-through). Errors are single-line and machine-parseable (--json).

export interface CliResult {
    exitCode: number;
    /** Machine-readable payload emitted as a single JSON line in --json mode. */
    data?: unknown;
    /** Human-readable message; stdout on success, the error text on failure. */
    message?: string;
}

const USAGE = [
    'usage: ccstatusline <command> [args] [--json] [--config <path>]',
    'commands:',
    '  get                                        print the effective (post-migration) config',
    '  widget add <line> <widget> [--index N] [--option value ...]',
    '  widget remove <line> <index-or-type>',
    '  widget move <line> <index> --to <index>',
    '  set <option-path> <value>                  set a global option (JSON value or plain string)',
    '  validate [--file <path>]                   exit 0/1 with a machine-readable report',
    '  help                                       show this help',
    'note: get and validate write the default config on first run if settings.json is missing'
];

function singleLine(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

function fail(message: string): CliResult {
    return { exitCode: 1, message: singleLine(message) };
}

function ok(message: string, data: unknown): CliResult {
    return { exitCode: 0, message, data };
}

function parseNonNegativeInt(text: string | undefined, label: string): number | string {
    const value = Number(text);
    if (text === undefined || text.trim() === '' || !Number.isInteger(value) || value < 0) {
        return `${label} must be a non-negative integer, got '${text ?? ''}'`;
    }
    return value;
}

function coerceValue(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function hasOwn(object: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(object, key);
}

type WidgetOptionKind = 'string' | 'boolean' | 'number' | 'dim' | 'merge' | 'json';

// Option names mirror the WidgetItem fields the TUI's items editor exposes.
const WIDGET_OPTION_KINDS: Record<string, WidgetOptionKind> = {
    color: 'string',
    backgroundColor: 'string',
    character: 'string',
    customText: 'string',
    customSymbol: 'string',
    commandPath: 'string',
    numberFormat: 'json',
    bold: 'boolean',
    rawValue: 'boolean',
    preserveColors: 'boolean',
    excludeFromAutoAlign: 'boolean',
    maxWidth: 'number',
    timeout: 'number',
    dim: 'dim',
    merge: 'merge'
};

// Options whose next argv token is their value (widget add also accepts
// value-less boolean flags, hence the separate boolean set).
const WIDGET_BOOLEAN_FLAGS = new Set(
    Object.entries(WIDGET_OPTION_KINDS)
        .filter(([, kind]) => kind === 'boolean')
        .map(([key]) => `--${key}`)
);
const VALUE_OPTION_FLAGS = new Set([
    ...Object.entries(WIDGET_OPTION_KINDS)
        .filter(([, kind]) => kind !== 'boolean')
        .map(([key]) => `--${key}`),
    '--index',
    '--metadata',
    '--file',
    '--to'
]);

/**
 * Pull the --json output flag out of argv without eating option values: a
 * --json token that follows a value-taking option (or fills a boolean option
 * before a non-`--` token) belongs to that option, not to the output flag.
 */
export function extractJsonFlag(argv: string[]): { args: string[]; json: boolean } {
    const valuePositions = new Set<number>();
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (token === undefined) {
            break;
        }
        const next = argv[i + 1];
        if (VALUE_OPTION_FLAGS.has(token) && next !== undefined) {
            valuePositions.add(i + 1);
        } else if (WIDGET_BOOLEAN_FLAGS.has(token) && next !== undefined && !next.startsWith('--')) {
            valuePositions.add(i + 1);
        }
    }
    const args: string[] = [];
    let json = false;
    argv.forEach((token, i) => {
        if (token === '--json' && !valuePositions.has(i)) {
            json = true;
        } else {
            args.push(token);
        }
    });
    return { args, json };
}

function coerceBooleanOption(name: string, text: string): { value: boolean } | string {
    if (text === 'true')
        return { value: true };
    if (text === 'false')
        return { value: false };
    return `option --${name} expects true or false, got '${text}'`;
}

function coerceOptionValue(kind: WidgetOptionKind, text: string, name: string): { value: unknown } | string {
    switch (kind) {
        case 'number': {
            const value = Number(text);
            return Number.isFinite(value)
                ? { value }
                : `option --${name} expects a number, got '${text}'`;
        }
        case 'boolean':
            return coerceBooleanOption(name, text);
        case 'dim':
            if (text === 'parens')
                return { value: 'parens' as const };
            return coerceBooleanOption(name, text);
        case 'merge':
            if (text === 'no-padding')
                return { value: 'no-padding' as const };
            return coerceBooleanOption(name, text);
        case 'json':
            try {
                return { value: JSON.parse(text) as unknown };
            } catch {
                return `option --${name} expects JSON, got '${text}'`;
            }
        default:
            return { value: text };
    }
}

async function persistSettings(next: Settings, success: { message: string; data: unknown }): Promise<CliResult> {
    // Validate-before-write: a mutation that would produce an invalid config is
    // rejected and nothing touches the disk.
    const parsed = SettingsSchema.safeParse(next);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
        return fail(`resulting config would be invalid (${where}${issue ? issue.message : 'unknown error'}); nothing was written`);
    }
    await saveSettings(parsed.data);
    return ok(success.message, success.data);
}

// Theme names outside POWERLINE_THEMES silently no-op in the regular renderer;
// surface a warning instead of failing so a typo never invalidates a config.
// 'custom' is the powerline off state and always allowed.
function getThemeWarnings(settings: Settings): string[] {
    if (!settings.theme || settings.theme === 'custom' || getPowerlineThemes().includes(settings.theme)) {
        return [];
    }
    return [`unknown theme '${settings.theme}' (known: ${getPowerlineThemes().filter((name) => name !== 'custom').join(', ')})`];
}

interface SettingsLoad { settings: Settings }

// Mutating commands must never overwrite an unreadable/invalid settings file
// with the in-memory defaults that loadSettings() falls back to.
async function loadMutableSettings(): Promise<SettingsLoad | CliResult> {
    const settings = await loadSettings();
    const loadError = getConfigLoadError();
    if (loadError !== null) {
        return fail(`refusing to modify invalid config at ${getConfigPath()}: ${loadError}; fix or remove the file first`);
    }
    return { settings };
}

async function cmdGet(): Promise<CliResult> {
    const settings = await loadSettings();
    const loadError = getConfigLoadError();
    if (loadError !== null) {
        return fail(`config is invalid: ${loadError}`);
    }
    return ok(JSON.stringify(settings, null, 2), settings);
}

async function cmdValidate(args: string[]): Promise<CliResult> {
    let filePath: string | undefined;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--file') {
            filePath = args[i + 1];
            if (!filePath || filePath.startsWith('--')) {
                return fail('--file requires a path argument');
            }
            i++;
        } else {
            return fail(`unknown option '${args[i]}' for validate`);
        }
    }

    if (filePath) {
        const result = await validateImportFile(filePath);
        if (result.status === 'valid') {
            return ok(`OK ${filePath}`, { valid: true, path: filePath });
        }
        const reason = singleLine(result.reason);
        return { exitCode: 1, message: reason, data: { valid: false, path: filePath, errors: [reason] } };
    }

    const settings = await loadSettings();
    const loadError = getConfigLoadError();
    const configPath = getConfigPath();
    if (loadError === null) {
        const warnings = getThemeWarnings(settings);
        return ok(
            warnings.length > 0 ? `OK ${configPath} (with warnings)` : `OK ${configPath}`,
            { valid: true, path: configPath, warnings }
        );
    }
    return { exitCode: 1, message: loadError, data: { valid: false, path: configPath, errors: [singleLine(loadError)] } };
}

async function cmdWidgetAdd(args: string[]): Promise<CliResult> {
    const positional: string[] = [];
    const options: Record<string, unknown> = {};
    const metadata: Record<string, string> = {};
    let indexArg: number | null = null;

    for (let i = 0; i < args.length; i++) {
        const token = args[i];
        if (token === undefined) {
            break;
        }
        if (!token.startsWith('--')) {
            positional.push(token);
            continue;
        }
        const key = token.slice(2);
        if (key === 'index') {
            const parsed = parseNonNegativeInt(args[i + 1], '--index');
            if (typeof parsed === 'string')
                return fail(parsed);
            indexArg = parsed;
            i++;
            continue;
        }
        if (key === 'metadata') {
            const pair = args[i + 1];
            const eq = pair ? pair.indexOf('=') : -1;
            if (!pair || eq <= 0) {
                return fail(`--metadata expects key=value, got '${pair ?? ''}'`);
            }
            metadata[pair.slice(0, eq)] = pair.slice(eq + 1);
            i++;
            continue;
        }
        const kind = WIDGET_OPTION_KINDS[key];
        if (!kind) {
            return fail(`unknown widget option '${token}'`);
        }
        const raw = args[i + 1];
        if (kind === 'boolean' && (raw === undefined || raw.startsWith('--'))) {
            options[key] = true;
            continue;
        }
        if (raw === undefined) {
            return fail(`option ${token} expects a value`);
        }
        const coerced = coerceOptionValue(kind, raw, key);
        if (typeof coerced === 'string')
            return fail(coerced);
        options[key] = coerced.value;
        i++;
    }

    const lineToken = positional[0];
    const widgetToken = positional[1];
    if (lineToken === undefined || widgetToken === undefined) {
        return fail('widget add requires a line index and a widget type, e.g. ccstatusline widget add 0 git-branch');
    }
    if (positional.length > 2) {
        return fail(`unexpected argument '${positional[2]}' for widget add`);
    }

    const lineResult = parseNonNegativeInt(lineToken, 'line index');
    if (typeof lineResult === 'string')
        return fail(lineResult);

    const load = await loadMutableSettings();
    if ('exitCode' in load)
        return load;
    const settings = load.settings;

    if (lineResult >= settings.lines.length) {
        return fail(`line index ${lineResult} out of range; config has ${settings.lines.length} lines`);
    }

    const type = resolveLegacyWidgetType(widgetToken);
    if (!getAllWidgetTypes(settings).includes(type)) {
        return fail(`unknown widget type '${widgetToken}'`);
    }

    const draft: Record<string, unknown> = { id: generateGuid(), type, ...options };
    if (Object.keys(metadata).length > 0) {
        draft.metadata = metadata;
    }
    const itemResult = WidgetItemSchema.safeParse(draft);
    if (!itemResult.success) {
        const issue = itemResult.error.issues[0];
        return fail(`invalid widget options: ${issue ? issue.message : 'unknown error'}`);
    }
    const item: WidgetItem = itemResult.data;

    const line = settings.lines[lineResult];
    if (line === undefined) {
        return fail(`line index ${lineResult} out of range; config has ${settings.lines.length} lines`);
    }
    if (indexArg !== null && indexArg > line.length) {
        return fail(`--index ${indexArg} out of range; line ${lineResult} has ${line.length} widgets`);
    }
    const insertAt = indexArg ?? line.length;

    return persistSettings(
        {
            ...settings,
            lines: settings.lines.map((existing, i) => i === lineResult
                ? [...existing.slice(0, insertAt), item, ...existing.slice(insertAt)]
                : existing)
        },
        {
            message: `added ${type} to line ${lineResult} at index ${insertAt}`,
            data: { added: true, line: lineResult, index: insertAt, type }
        }
    );
}

async function cmdWidgetRemove(args: string[]): Promise<CliResult> {
    const lineToken = args[0];
    const targetToken = args[1];
    if (lineToken === undefined || targetToken === undefined) {
        return fail('widget remove requires a line index and an index-or-type');
    }
    if (args.length > 2) {
        return fail(`unexpected argument '${args[2]}' for widget remove`);
    }

    const lineResult = parseNonNegativeInt(lineToken, 'line index');
    if (typeof lineResult === 'string')
        return fail(lineResult);

    const load = await loadMutableSettings();
    if ('exitCode' in load)
        return load;
    const settings = load.settings;

    if (lineResult >= settings.lines.length) {
        return fail(`line index ${lineResult} out of range; config has ${settings.lines.length} lines`);
    }

    const sourceLine = settings.lines[lineResult];
    if (sourceLine === undefined) {
        return fail(`line index ${lineResult} out of range; config has ${settings.lines.length} lines`);
    }
    const line = [...sourceLine];
    let removeIdx: number;
    if (/^\d+$/.test(targetToken)) {
        removeIdx = Number(targetToken);
        if (removeIdx >= line.length) {
            return fail(`index ${removeIdx} out of range; line ${lineResult} has ${line.length} widgets`);
        }
    } else {
        const type = resolveLegacyWidgetType(targetToken);
        removeIdx = line.findIndex(item => item.type === type);
        if (removeIdx === -1) {
            return fail(`no widget of type '${targetToken}' on line ${lineResult}`);
        }
    }

    const removed = line.splice(removeIdx, 1)[0];
    if (removed === undefined) {
        return fail(`index ${removeIdx} out of range; line ${lineResult} has ${line.length + 1} widgets`);
    }
    return persistSettings(
        {
            ...settings,
            lines: settings.lines.map((existing, i) => i === lineResult ? line : existing)
        },
        {
            message: `removed ${removed.type} from line ${lineResult} at index ${removeIdx}`,
            data: { removed: true, line: lineResult, index: removeIdx, type: removed.type }
        }
    );
}

async function cmdWidgetMove(args: string[]): Promise<CliResult> {
    const positional: string[] = [];
    let to: number | null = null;
    for (let i = 0; i < args.length; i++) {
        const token = args[i];
        if (token === undefined) {
            break;
        }
        if (token === '--to') {
            const parsed = parseNonNegativeInt(args[i + 1], '--to');
            if (typeof parsed === 'string')
                return fail(parsed);
            to = parsed;
            i++;
        } else if (token.startsWith('--')) {
            return fail(`unknown option '${token}' for widget move`);
        } else {
            positional.push(token);
        }
    }

    const lineToken = positional[0];
    const fromToken = positional[1];
    if (lineToken === undefined || fromToken === undefined) {
        return fail('widget move requires a line index, a widget index, and --to <index>');
    }
    if (positional.length > 2) {
        return fail(`unexpected argument '${positional[2]}' for widget move`);
    }
    if (to === null) {
        return fail('widget move requires --to <index>');
    }

    const lineResult = parseNonNegativeInt(lineToken, 'line index');
    if (typeof lineResult === 'string')
        return fail(lineResult);
    const fromResult = parseNonNegativeInt(fromToken, 'widget index');
    if (typeof fromResult === 'string')
        return fail(fromResult);

    const load = await loadMutableSettings();
    if ('exitCode' in load)
        return load;
    const settings = load.settings;

    if (lineResult >= settings.lines.length) {
        return fail(`line index ${lineResult} out of range; config has ${settings.lines.length} lines`);
    }

    const sourceLine = settings.lines[lineResult];
    if (sourceLine === undefined) {
        return fail(`line index ${lineResult} out of range; config has ${settings.lines.length} lines`);
    }
    const line = [...sourceLine];
    if (fromResult >= line.length) {
        return fail(`index ${fromResult} out of range; line ${lineResult} has ${line.length} widgets`);
    }
    if (to > line.length - 1) {
        return fail(`--to ${to} out of range; line ${lineResult} has ${line.length} widgets`);
    }

    const moved = line.splice(fromResult, 1)[0];
    if (moved === undefined) {
        return fail(`index ${fromResult} out of range; line ${lineResult} has ${line.length + 1} widgets`);
    }
    line.splice(to, 0, moved);

    return persistSettings(
        {
            ...settings,
            lines: settings.lines.map((existing, i) => i === lineResult ? line : existing)
        },
        {
            message: `moved ${moved.type} from index ${fromResult} to ${to} on line ${lineResult}`,
            data: { moved: true, line: lineResult, from: fromResult, to, type: moved.type }
        }
    );
}

async function cmdWidget(sub: string | undefined, args: string[]): Promise<CliResult> {
    if (sub === 'add')
        return cmdWidgetAdd(args);
    if (sub === 'remove')
        return cmdWidgetRemove(args);
    if (sub === 'move')
        return cmdWidgetMove(args);
    return fail(`unknown widget command '${sub ?? ''}'; expected add, remove, or move`);
}

async function cmdSet(args: string[]): Promise<CliResult> {
    if (args.length < 2) {
        return fail('set requires an option path and a value');
    }

    const load = await loadMutableSettings();
    if ('exitCode' in load)
        return load;

    const optionPath = args[0];
    if (optionPath === undefined) {
        return fail('set requires an option path and a value');
    }
    const value = coerceValue(args.slice(1).join(' '));
    const parts = optionPath.split('.');

    // Deep-clone through JSON: Settings is JSON-serializable by construction.
    const next = JSON.parse(JSON.stringify(load.settings)) as Settings;
    let node = next as unknown as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (part === undefined) {
            return fail(`unknown option path '${optionPath}'`);
        }
        const child = node[part];
        if (typeof child !== 'object' || child === null) {
            return fail(`unknown option path '${parts.slice(0, i + 1).join('.')}'`);
        }
        node = child as Record<string, unknown>;
    }

    const last = parts[parts.length - 1];
    if (last === undefined) {
        return fail(`unknown option '${optionPath}'`);
    }
    // hasOwn-style checks: `in` also matches inherited properties, so
    // `set toString x` would pass the guard, get stripped by the schema, and
    // report success while writing nothing. Object.hasOwn is Node 16.9+ and
    // the build targets Node 14+, hence the prototype call.
    if (!hasOwn(node, last) && !(parts.length === 1 && hasOwn(SettingsSchema.shape, last))) {
        return fail(`unknown option '${optionPath}'`);
    }
    node[last] = value;

    const warnings = parts.length === 1 && last === 'theme' ? getThemeWarnings(next) : [];
    return persistSettings(next, {
        message: `set ${optionPath} = ${JSON.stringify(value)}${warnings.length > 0 ? ` (warning: ${warnings[0]})` : ''}`,
        data: { set: optionPath, value, warnings }
    });
}

function cmdHelp(): CliResult {
    return ok(USAGE.join('\n'), { usage: USAGE });
}

export async function executeCli(argv: string[]): Promise<CliResult> {
    const { args } = extractJsonFlag(argv);
    const command = args[0];

    if (command === 'help' || command === '--help' || command === '-h') {
        return cmdHelp();
    }
    if (command === 'get') {
        return cmdGet();
    }
    if (command === 'validate') {
        return cmdValidate(args.slice(1));
    }
    if (command === 'set') {
        return cmdSet(args.slice(1));
    }
    if (command === 'widget') {
        return cmdWidget(args[1], args.slice(2));
    }
    return fail(`unknown command '${command ?? ''}'; run 'ccstatusline help'`);
}

/** True when argv names a CLI subcommand and stdin is a terminal (no piped render input). */
export function isCliMode(args: string[], isTty: boolean): boolean {
    return isTty && args.length > 0;
}

export function formatCliResult(result: CliResult, json: boolean): { stream: 'stdout' | 'stderr'; text: string } {
    if (result.exitCode !== 0) {
        const error = singleLine(result.message ?? 'unknown error');
        return json
            ? { stream: 'stdout', text: JSON.stringify({ error }) }
            : { stream: 'stderr', text: `Error: ${error}` };
    }
    if (!json) {
        return { stream: 'stdout', text: result.message ?? '' };
    }
    return { stream: 'stdout', text: JSON.stringify(result.data ?? { ok: true }) };
}

export async function runCli(argv: string[]): Promise<never> {
    const { args, json } = extractJsonFlag(argv);
    const result = await executeCli(args);
    const output = formatCliResult(result, json);
    if (output.stream === 'stdout') {
        console.log(output.text);
    } else {
        console.error(output.text);
    }
    process.exit(result.exitCode);
}
