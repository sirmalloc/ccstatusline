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
import * as gitRemote from '../git-remote';
import { getWidgetValue } from '../widget-values';

// Mock child_process
vi.mock('child_process', () => ({ execSync: vi.fn() }));

const mockExecSync = execSync as unknown as {
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
    mockImplementation: (impl: () => never) => void;
};

describe('Widget Values - Typed Dispatch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    describe('Widgets with getValue() (typed dispatch)', () => {
        test('returns number from context-percentage', () => {
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

        test('returns number from tokens-input', () => {
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

            const value = getWidgetValue('tokens-input', context, { id: 'test', type: 'tokens-input' });
            expect(value).toBe(150000);
            expect(typeof value).toBe('number');
        });

        test('returns number from tokens-output', () => {
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

            const value = getWidgetValue('tokens-output', context, { id: 'test', type: 'tokens-output' });
            expect(value).toBe(10000);
            expect(typeof value).toBe('number');
        });

        test('returns number from tokens-total', () => {
            const context: RenderContext = {
                tokenMetrics: {
                    inputTokens: 150000,
                    outputTokens: 10000,
                    cachedTokens: 0,
                    totalTokens: 160000,
                    contextLength: 160000
                }
            };

            const value = getWidgetValue('tokens-total', context, { id: 'test', type: 'tokens-total' });
            expect(value).toBe(160000);
            expect(typeof value).toBe('number');
        });

        test('returns number from session-cost', () => {
            const context: RenderContext = { data: { cost: { total_cost_usd: 0.45 } } };

            const value = getWidgetValue('session-cost', context, { id: 'test', type: 'session-cost' });
            expect(value).toBe(0.45);
            expect(typeof value).toBe('number');
        });

        test('returns boolean from git-changes (has changes)', () => {
            // Mock git commands: is-inside-work-tree, unstaged diff, staged diff
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('1 file changed, 100 insertions(+)');
            mockExecSync.mockReturnValueOnce('');

            const context: RenderContext = {};
            const value = getWidgetValue('git-changes', context, { id: 'test', type: 'git-changes' });
            expect(value).toBe(true);
            expect(typeof value).toBe('boolean');
        });

        test('returns boolean from git-changes (no changes)', () => {
            // Mock git commands: is-inside-work-tree, unstaged diff, staged diff
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('');
            mockExecSync.mockReturnValueOnce('');

            const context: RenderContext = {};
            const value = getWidgetValue('git-changes', context, { id: 'test', type: 'git-changes' });
            expect(value).toBe(false);
            expect(typeof value).toBe('boolean');
        });

        test('returns boolean from git-is-fork (is a fork)', () => {
            const context: RenderContext = {};
            vi.spyOn(gitRemote, 'getForkStatus').mockReturnValueOnce({
                isFork: true,
                origin: null,
                upstream: null
            });

            const value = getWidgetValue('git-is-fork', context, { id: 'test', type: 'git-is-fork' });
            expect(value).toBe(true);
            expect(typeof value).toBe('boolean');
        });

        test('returns boolean from git-is-fork (not a fork)', () => {
            const context: RenderContext = {};
            vi.spyOn(gitRemote, 'getForkStatus').mockReturnValueOnce({
                isFork: false,
                origin: null,
                upstream: null
            });

            const value = getWidgetValue('git-is-fork', context, { id: 'test', type: 'git-is-fork' });
            expect(value).toBe(false);
            expect(typeof value).toBe('boolean');
        });

        test('returns null when context data is missing', () => {
            const context: RenderContext = { data: {} };
            const value = getWidgetValue('context-percentage', context, { id: 'test', type: 'context-percentage' });
            expect(value).toBeNull();
        });
    });

    describe('Widgets without getValue() (string fallback)', () => {
        test('returns string from git-branch via raw render', () => {
            // Mock git commands: is-inside-work-tree, branch name
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('feature/advanced-operators\n');

            const context: RenderContext = {};
            const value = getWidgetValue('git-branch', context, { id: 'test', type: 'git-branch' });
            expect(value).toBe('feature/advanced-operators');
            expect(typeof value).toBe('string');
        });

        test('returns string from model via raw render', () => {
            const context: RenderContext = { data: { model: { id: 'claude-opus-4-6' } } };

            const value = getWidgetValue('model', context, { id: 'test', type: 'model' });
            expect(value).toBe('claude-opus-4-6');
            expect(typeof value).toBe('string');
        });

        test('returns string from git-insertions via normal render', () => {
            // GitInsertions does not support rawValue, so it renders normally
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('1 file changed, 100 insertions(+)');
            mockExecSync.mockReturnValueOnce('');

            const context: RenderContext = {};
            const value = getWidgetValue('git-insertions', context, { id: 'test', type: 'git-insertions' });
            expect(value).toBe('+100');
            expect(typeof value).toBe('string');
        });

        test('returns string from git-deletions via normal render', () => {
            // GitDeletions does not support rawValue, so it renders normally
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('');
            mockExecSync.mockReturnValueOnce('1 file changed, 50 deletions(-)');

            const context: RenderContext = {};
            const value = getWidgetValue('git-deletions', context, { id: 'test', type: 'git-deletions' });
            expect(value).toBe('-50');
            expect(typeof value).toBe('string');
        });

        test('returns null for empty rendered output', () => {
            const value = getWidgetValue('custom-text', {}, { id: 'test', type: 'custom-text' });
            expect(value).toBeNull();
        });
    });

    describe('Edge cases', () => {
        test('returns null for unknown widget types', () => {
            const value = getWidgetValue('unknown-widget', {}, { id: 'test', type: 'unknown-widget' });
            expect(value).toBeNull();
        });

        test('returns null when git is not available', () => {
            // Mock git command returning false (not in a git repo)
            mockExecSync.mockReturnValueOnce('false\n');

            const value = getWidgetValue('git-changes', {}, { id: 'test', type: 'git-changes' });
            expect(value).toBeNull();
        });
    });
});
