import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { loadClaudeSettingsSync } from '../claude-settings';

vi.mock('../claude-settings', () => ({ loadClaudeSettingsSync: vi.fn(() => ({})) }));

const mockLoadClaudeSettingsSync = loadClaudeSettingsSync as unknown as ReturnType<typeof vi.fn>;

// Import after mock setup
const { resolveAutocompactPercent } = await import('../autocompact');

describe('resolveAutocompactPercent', () => {
    beforeEach(() => {
        delete process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
        mockLoadClaudeSettingsSync.mockReturnValue({});
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('returns null when no source provides a value', () => {
        expect(resolveAutocompactPercent()).toBeNull();
    });

    describe('process.env priority', () => {
        it('returns value from process.env when set', () => {
            process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = '75';
            expect(resolveAutocompactPercent()).toBe(75);
        });

        it('takes priority over Claude settings', () => {
            process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = '60';
            mockLoadClaudeSettingsSync.mockReturnValue({ env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '80' } });
            expect(resolveAutocompactPercent()).toBe(60);
        });
    });

    describe('Claude settings.json env fallback', () => {
        it('returns value from Claude settings env when process.env is not set', () => {
            mockLoadClaudeSettingsSync.mockReturnValue({ env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '83' } });
            expect(resolveAutocompactPercent()).toBe(83);
        });

        it('handles numeric value in Claude settings', () => {
            mockLoadClaudeSettingsSync.mockReturnValue({ env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: 42 } });
            expect(resolveAutocompactPercent()).toBe(42);
        });
    });

    describe('invalid values are skipped', () => {
        it('skips process.env value of 0 and falls through', () => {
            process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = '0';
            mockLoadClaudeSettingsSync.mockReturnValue({ env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '50' } });
            expect(resolveAutocompactPercent()).toBe(50);
        });

        it('skips process.env value over 100 and falls through', () => {
            process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = '150';
            mockLoadClaudeSettingsSync.mockReturnValue({ env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '50' } });
            expect(resolveAutocompactPercent()).toBe(50);
        });

        it('skips non-numeric process.env value and falls through', () => {
            process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = 'abc';
            mockLoadClaudeSettingsSync.mockReturnValue({ env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '70' } });
            expect(resolveAutocompactPercent()).toBe(70);
        });

        it('skips invalid Claude settings value and returns null', () => {
            mockLoadClaudeSettingsSync.mockReturnValue({ env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: 'not-a-number' } });
            expect(resolveAutocompactPercent()).toBeNull();
        });

        it('returns null when Claude settings env is missing', () => {
            mockLoadClaudeSettingsSync.mockReturnValue({ env: {} });
            expect(resolveAutocompactPercent()).toBeNull();
        });

        it('returns null when Claude settings has no env key', () => {
            mockLoadClaudeSettingsSync.mockReturnValue({});
            expect(resolveAutocompactPercent()).toBeNull();
        });
    });

    describe('error handling', () => {
        it('returns null when loadClaudeSettingsSync throws', () => {
            mockLoadClaudeSettingsSync.mockImplementation(() => {
                throw new Error('File not found');
            });
            expect(resolveAutocompactPercent()).toBeNull();
        });
    });
});