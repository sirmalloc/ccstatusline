import {
    execFileSync,
    execSync
} from 'child_process';
import {
    existsSync,
    readFileSync,
    statSync
} from 'fs';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { renderOsc8Link } from '../../utils/hyperlink';
import { GitPrWidget } from '../GitPr';

vi.mock('child_process', () => ({ execFileSync: vi.fn(), execSync: vi.fn() }));
vi.mock('fs', () => ({
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    statSync: vi.fn(),
    writeFileSync: vi.fn()
}));

const mockExecSync = execSync as unknown as ReturnType<typeof vi.fn>;
const mockExecFileSync = execFileSync as unknown as ReturnType<typeof vi.fn>;
const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>;
const mockStatSync = statSync as unknown as ReturnType<typeof vi.fn>;

function setupGitWorkTree(): void {
    mockExecSync.mockReturnValue('true\n');
}

function setupCacheMiss(): void {
    mockExistsSync.mockReturnValue(false);
}

function setupCacheHit(data: Record<string, unknown>): void {
    setupGitWorkTree();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ mtimeMs: Date.now() - 1000 });
    mockReadFileSync.mockReturnValue(JSON.stringify(data));
}

function setupGhResponse(data: Record<string, unknown>): void {
    setupGitWorkTree();
    setupCacheMiss();
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'gh' && args[0] === '--version')
            return 'gh version 2.0.0\n';
        if (cmd === 'gh' && args[0] === 'pr')
            return JSON.stringify(data);
        return '';
    });
}

function render(options: {
    cwd?: string;
    hideNoGit?: boolean;
    hideStatus?: boolean;
    hideTitle?: boolean;
    isPreview?: boolean;
    rawValue?: boolean;
} = {}): string | null {
    const widget = new GitPrWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const metadata: Record<string, string> = {};
    if (options.hideNoGit)
        metadata.hideNoGit = 'true';
    if (options.hideStatus)
        metadata.hideStatus = 'true';
    if (options.hideTitle)
        metadata.hideTitle = 'true';

    const item: WidgetItem = {
        id: 'git-pr',
        type: 'git-pr',
        rawValue: options.rawValue,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

const SAMPLE_PR = {
    number: 123,
    url: 'https://github.com/owner/repo/pull/123',
    title: 'Fix authentication bug',
    state: 'OPEN',
    reviewDecision: ''
};

describe('GitPrWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview with OSC 8 link', () => {
        const result = render({ isPreview: true });
        expect(result).toBe(
            `${renderOsc8Link('https://github.com/owner/repo/pull/42', 'PR #42')} OPEN Example PR title`
        );
    });

    it('should render preview with rawValue', () => {
        const result = render({ isPreview: true, rawValue: true });
        expect(result).toBe(
            `${renderOsc8Link('https://github.com/owner/repo/pull/42', '#42')} OPEN Example PR title`
        );
    });

    it('should render preview without status when hideStatus enabled', () => {
        const result = render({ isPreview: true, hideStatus: true });
        expect(result).toBe(
            `${renderOsc8Link('https://github.com/owner/repo/pull/42', 'PR #42')} Example PR title`
        );
    });

    it('should render preview without title when hideTitle enabled', () => {
        const result = render({ isPreview: true, hideTitle: true });
        expect(result).toBe(
            `${renderOsc8Link('https://github.com/owner/repo/pull/42', 'PR #42')} OPEN`
        );
    });

    it('should render full PR display from cache', () => {
        setupCacheHit(SAMPLE_PR);

        const result = render({ cwd: '/tmp/repo' });
        expect(result).toBe(
            `${renderOsc8Link('https://github.com/owner/repo/pull/123', 'PR #123')} OPEN Fix authentication bug`
        );
    });

    it('should render full PR display from gh CLI', () => {
        setupGhResponse(SAMPLE_PR);

        const result = render({ cwd: '/tmp/repo' });
        expect(result).toBe(
            `${renderOsc8Link('https://github.com/owner/repo/pull/123', 'PR #123')} OPEN Fix authentication bug`
        );
    });

    it('should return (no PR) when not in git repo', () => {
        mockExecSync.mockImplementation(() => { throw new Error('Not a git repo'); });

        expect(render({ cwd: '/tmp/not-a-repo' })).toBe('(no PR)');
    });

    it('should return null when hideNoGit and not in git repo', () => {
        mockExecSync.mockImplementation(() => { throw new Error('Not a git repo'); });

        expect(render({ cwd: '/tmp/not-a-repo', hideNoGit: true })).toBeNull();
    });

    it('should return (no PR) when no cwd', () => {
        expect(render()).toBe('(no PR)');
    });

    it('should return (no PR) when gh is not installed', () => {
        setupGitWorkTree();
        setupCacheMiss();
        mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
            if (cmd === 'gh' && args[0] === '--version')
                throw new Error('not found');
            throw new Error('unexpected');
        });

        expect(render({ cwd: '/tmp/repo' })).toBe('(no PR)');
    });

    it('should truncate long titles', () => {
        const longPr = {
            ...SAMPLE_PR,
            title: 'This is a very long pull request title that exceeds the default limit'
        };
        setupCacheHit(longPr);

        const result = render({ cwd: '/tmp/repo' });
        expect(result).toContain('This is a very long pull requ\u2026');
    });

    it('should render MERGED status', () => {
        setupCacheHit({ ...SAMPLE_PR, state: 'MERGED' });

        expect(render({ cwd: '/tmp/repo' })).toContain('MERGED');
    });

    it('should render APPROVED status', () => {
        setupCacheHit({ ...SAMPLE_PR, state: 'OPEN', reviewDecision: 'APPROVED' });

        expect(render({ cwd: '/tmp/repo' })).toContain('APPROVED');
    });

    it('should render CHANGES_REQ status', () => {
        setupCacheHit({ ...SAMPLE_PR, state: 'OPEN', reviewDecision: 'CHANGES_REQUESTED' });

        expect(render({ cwd: '/tmp/repo' })).toContain('CHANGES_REQ');
    });
});