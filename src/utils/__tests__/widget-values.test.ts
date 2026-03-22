import { execSync } from 'child_process';
import {
    beforeEach,
    describe,
    expect,
    test,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';

import { clearGitCache } from '../git';
import {
    getWidgetBooleanValue,
    getWidgetNumericValue,
    getWidgetStringValue,
    getWidgetValue,
    supportsNumericValue
} from '../widget-values';

// Mock child_process
vi.mock('child_process', () => ({ execSync: vi.fn() }));

const mockExecSync = execSync as unknown as {
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
    mockImplementation: (impl: () => never) => void;
};

// Mock git-remote module
const mockGetForkStatus = vi.fn();
vi.mock('../git-remote', () => ({
    getForkStatus: mockGetForkStatus
}));

describe('Widget Values', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    test('extracts context-percentage value', () => {
        const context: RenderContext = {
            data: {
                context_window: {
                    context_window_size: 200000,
                    total_input_tokens: 150000,
                    total_output_tokens: 10000,
                    current_usage: null,
                    used_percentage: 80,
                    remaining_percentage: 20
                }
            }
        };

        const value = getWidgetNumericValue('context-percentage', context, { id: 'test', type: 'context-percentage' });
        expect(value).toBe(80);
    });

    test('extracts git-changes value', () => {
        // Mock git commands: is-inside-work-tree, unstaged diff, staged diff
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('1 file changed, 100 insertions(+)');
        mockExecSync.mockReturnValueOnce('');

        const context: RenderContext = {};

        const value = getWidgetNumericValue('git-changes', context, { id: 'test', type: 'git-changes' });
        expect(value).toBe(100);  // git-changes returns insertions count
    });

    test('extracts git-insertions value', () => {
        // Mock git commands: is-inside-work-tree, unstaged diff, staged diff
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('1 file changed, 100 insertions(+)');
        mockExecSync.mockReturnValueOnce('');

        const context: RenderContext = {};

        const value = getWidgetNumericValue('git-insertions', context, { id: 'test', type: 'git-insertions' });
        expect(value).toBe(100);
    });

    test('extracts git-deletions value', () => {
        // Mock git commands: is-inside-work-tree, unstaged diff, staged diff
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('');
        mockExecSync.mockReturnValueOnce('1 file changed, 50 deletions(-)');

        const context: RenderContext = {};

        const value = getWidgetNumericValue('git-deletions', context, { id: 'test', type: 'git-deletions' });
        expect(value).toBe(-50);  // Widget renders "-50", parses to negative number
    });

    test('extracts git-is-fork value when repo is a fork', () => {
        const context: RenderContext = {};

        // Mock getForkStatus to return fork status
        mockGetForkStatus.mockReturnValueOnce({
            isFork: true,
            origin: null,
            upstream: null
        });

        const value = getWidgetNumericValue('git-is-fork', context, { id: 'test', type: 'git-is-fork' });
        expect(value).toBe(1);  // Boolean true converted to 1
    });

    test('extracts git-is-fork value when repo is not a fork', () => {
        const context: RenderContext = {};

        // Mock getForkStatus to return non-fork status
        mockGetForkStatus.mockReturnValueOnce({
            isFork: false,
            origin: null,
            upstream: null
        });

        const value = getWidgetNumericValue('git-is-fork', context, { id: 'test', type: 'git-is-fork' });
        expect(value).toBe(0);  // Boolean false converted to 0
    });

    test('extracts tokens-input value', () => {
        const context: RenderContext = {
            data: {
                context_window: {
                    context_window_size: 200000,
                    total_input_tokens: 150000,
                    total_output_tokens: 10000,
                    current_usage: null,
                    used_percentage: null,
                    remaining_percentage: null
                }
            }
        };

        const value = getWidgetNumericValue('tokens-input', context, { id: 'test', type: 'tokens-input' });
        expect(value).toBe(150000);
    });

    test('extracts tokens-output value', () => {
        const context: RenderContext = {
            data: {
                context_window: {
                    context_window_size: 200000,
                    total_input_tokens: 150000,
                    total_output_tokens: 10000,
                    current_usage: null,
                    used_percentage: null,
                    remaining_percentage: null
                }
            }
        };

        const value = getWidgetNumericValue('tokens-output', context, { id: 'test', type: 'tokens-output' });
        expect(value).toBe(10000);
    });

    test('extracts tokens-total value', () => {
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 150000,
                outputTokens: 10000,
                cachedTokens: 0,
                totalTokens: 160000,
                contextLength: 160000
            }
        };

        const value = getWidgetNumericValue('tokens-total', context, { id: 'test', type: 'tokens-total' });
        expect(value).toBe(160000);
    });

    test('extracts session-cost value', () => {
        const context: RenderContext = {
            data: {
                cost: {
                    total_cost_usd: 0.45
                }
            }
        };

        const value = getWidgetNumericValue('session-cost', context, { id: 'test', type: 'session-cost' });
        expect(value).toBe(0.45);
    });

    test('returns null for unsupported widget types', () => {
        const value = getWidgetNumericValue('custom-text', {}, { id: 'test', type: 'custom-text' });
        expect(value).toBeNull();
    });

    test('returns null when data is missing', () => {
        // Mock git command returning false (not in a git repo)
        mockExecSync.mockReturnValueOnce('false\n');

        const value = getWidgetNumericValue('git-changes', {}, { id: 'test', type: 'git-changes' });
        expect(value).toBeNull();  // "(no git)" should parse to null
    });

    test('returns null when context-percentage data missing', () => {
        const context: RenderContext = {
            data: {}
        };
        const value = getWidgetNumericValue('context-percentage', context, { id: 'test', type: 'context-percentage' });
        expect(value).toBeNull();
    });

    test('supportsNumericValue identifies supported widgets', () => {
        expect(supportsNumericValue('context-percentage')).toBe(true);
        expect(supportsNumericValue('context-percentage-usable')).toBe(true);
        expect(supportsNumericValue('git-changes')).toBe(true);
        expect(supportsNumericValue('git-insertions')).toBe(true);
        expect(supportsNumericValue('git-deletions')).toBe(true);
        expect(supportsNumericValue('tokens-input')).toBe(true);
        expect(supportsNumericValue('tokens-output')).toBe(true);
        expect(supportsNumericValue('tokens-cached')).toBe(true);
        expect(supportsNumericValue('tokens-total')).toBe(true);
        expect(supportsNumericValue('session-cost')).toBe(true);
        expect(supportsNumericValue('custom-text')).toBe(true);  // All widgets support numeric value extraction (may return null)
        expect(supportsNumericValue('unknown-widget')).toBe(false);
    });

    describe('String Value Extraction', () => {
        test('extracts git-branch string value', () => {
            // Mock git commands: is-inside-work-tree, branch name
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('feature/advanced-operators\n');

            const context: RenderContext = {};
            const value = getWidgetStringValue('git-branch', context, { id: 'test', type: 'git-branch' });
            expect(value).toBe('feature/advanced-operators');
        });

        test('extracts model string value', () => {
            const context: RenderContext = {
                data: {
                    model: {
                        id: 'claude-opus-4-6'
                    }
                }
            };

            const value = getWidgetStringValue('model', context, { id: 'test', type: 'model' });
            expect(value).toBe('claude-opus-4-6');
        });

        test('returns null for empty output', () => {
            const value = getWidgetStringValue('custom-text', {}, { id: 'test', type: 'custom-text' });
            expect(value).toBeNull();
        });
    });

    describe('Boolean Value Extraction', () => {
        test('extracts git-changes boolean value (has changes)', () => {
            // Mock git commands: is-inside-work-tree, unstaged diff, staged diff
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('1 file changed, 100 insertions(+)');
            mockExecSync.mockReturnValueOnce('');

            const context: RenderContext = {};
            const value = getWidgetBooleanValue('git-changes', context, { id: 'test', type: 'git-changes' });
            expect(value).toBe(true);
        });

        test('extracts git-changes boolean value (no changes)', () => {
            // Mock git commands: is-inside-work-tree, unstaged diff, staged diff
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('');
            mockExecSync.mockReturnValueOnce('');

            const context: RenderContext = {};
            const value = getWidgetBooleanValue('git-changes', context, { id: 'test', type: 'git-changes' });
            expect(value).toBe(false);
        });

        test('parses "true" string as boolean', () => {
            const context: RenderContext = {};
            const value = getWidgetBooleanValue('custom-text', context, {
                id: 'test',
                type: 'custom-text',
                customText: 'true'
            });
            expect(value).toBe(true);
        });

        test('parses "false" string as boolean', () => {
            const context: RenderContext = {};
            const value = getWidgetBooleanValue('custom-text', context, {
                id: 'test',
                type: 'custom-text',
                customText: 'false'
            });
            expect(value).toBe(false);
        });

        test('returns null for non-boolean strings', () => {
            const context: RenderContext = {
                data: {
                    model: {
                        id: 'claude-opus-4-6'
                    }
                }
            };
            const value = getWidgetBooleanValue('model', context, { id: 'test', type: 'model' });
            expect(value).toBeNull();
        });
    });

    describe('Generic Value Extraction', () => {
        test('prefers numeric value when available', () => {
            const context: RenderContext = {
                data: {
                    context_window: {
                        context_window_size: 200000,
                        total_input_tokens: 150000,
                        total_output_tokens: 10000,
                        current_usage: null,
                        used_percentage: 80,
                        remaining_percentage: 20
                    }
                }
            };

            const value = getWidgetValue('context-percentage', context, { id: 'test', type: 'context-percentage' });
            expect(value).toBe(80);
            expect(typeof value).toBe('number');
        });

        test('returns numeric value for git-changes', () => {
            // Mock git commands: is-inside-work-tree, unstaged diff, staged diff
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('1 file changed, 100 insertions(+)');
            mockExecSync.mockReturnValueOnce('');

            const context: RenderContext = {};
            const value = getWidgetValue('git-changes', context, { id: 'test', type: 'git-changes' });
            // git-changes primary type is numeric (insertions count)
            // It can be used with boolean operators via type coercion
            expect(typeof value).toBe('number');
            expect(value).toBe(100);
        });

        test('returns string when numeric and boolean not available', () => {
            // Mock git commands: git rev-parse --is-inside-work-tree, git branch --show-current
            // Git commands are cached, so only mocked once even though widget renders multiple times
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('main\n');

            const context: RenderContext = {};
            const value = getWidgetValue('git-branch', context, { id: 'test', type: 'git-branch' });
            expect(value).toBe('main');
            expect(typeof value).toBe('string');
        });

        test('returns null when no value available', () => {
            const value = getWidgetValue('custom-text', {}, { id: 'test', type: 'custom-text' });
            expect(value).toBeNull();
        });
    });
});
