import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { ClaudeAccountEmailWidget } from '../ClaudeAccountEmail';

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;

let tempHomeDir: string;

function render(options: {
    rawValue?: boolean;
    isPreview?: boolean;
} = {}): string | null {
    const {
        rawValue = false,
        isPreview = false
    } = options;

    const widget = new ClaudeAccountEmailWidget();
    const context: RenderContext = { isPreview };
    const item: WidgetItem = {
        id: 'claude-account-email',
        type: 'claude-account-email',
        rawValue
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('ClaudeAccountEmailWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        tempHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-claude-account-email-'));
    });

    afterEach(() => {
        fs.rmSync(tempHomeDir, { recursive: true, force: true });

        if (ORIGINAL_HOME === undefined) {
            delete process.env.HOME;
        } else {
            process.env.HOME = ORIGINAL_HOME;
        }

        if (ORIGINAL_CLAUDE_CONFIG_DIR === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR;
        } else {
            process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CLAUDE_CONFIG_DIR;
        }

        vi.restoreAllMocks();
    });

    it('returns labelled preview text in preview mode', () => {
        expect(render({ isPreview: true })).toBe('Account: you@example.com');
    });

    it('returns raw preview text in preview mode when rawValue is enabled', () => {
        expect(render({ isPreview: true, rawValue: true })).toBe('you@example.com');
    });

    it('reads the Claude account email from the default homedir when HOME is unset', () => {
        delete process.env.HOME;
        delete process.env.CLAUDE_CONFIG_DIR;
        vi.spyOn(os, 'homedir').mockReturnValue(tempHomeDir);

        const claudeJsonPath = path.join(tempHomeDir, '.claude.json');
        fs.writeFileSync(claudeJsonPath, JSON.stringify({ oauthAccount: { emailAddress: 'user@example.com' } }), 'utf-8');

        expect(render()).toBe('Account: user@example.com');
    });

    it('returns the raw email when rawValue is enabled', () => {
        delete process.env.HOME;
        delete process.env.CLAUDE_CONFIG_DIR;
        vi.spyOn(os, 'homedir').mockReturnValue(tempHomeDir);

        const claudeJsonPath = path.join(tempHomeDir, '.claude.json');
        fs.writeFileSync(claudeJsonPath, JSON.stringify({ oauthAccount: { emailAddress: 'user@example.com' } }), 'utf-8');

        expect(render({ rawValue: true })).toBe('user@example.com');
    });

    it('returns null when the Claude account email is unavailable', () => {
        process.env.CLAUDE_CONFIG_DIR = path.join(tempHomeDir, '.claude');

        expect(render()).toBeNull();
    });
});