import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import type { WidgetItem } from '../../types/Widget';
import * as gitRemote from '../../utils/git-remote';
import { GitIsForkWidget } from '../GitIsFork';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

describe('GitIsForkWidget', () => {
    const widget = new GitIsForkWidget();
    const item: WidgetItem = { id: 'fork', type: 'git-is-fork' };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    describe('getValueType', () => {
        it('returns boolean', () => {
            expect(widget.getValueType()).toBe('boolean');
        });
    });

    describe('getValue', () => {
        it('returns true when repo is a fork', () => {
            vi.spyOn(gitRemote, 'getForkStatus').mockReturnValue({
                isFork: true,
                origin: { name: 'origin', url: 'git@github.com:user/repo.git', host: 'github.com', owner: 'user', repo: 'repo' },
                upstream: { name: 'upstream', url: 'git@github.com:org/repo.git', host: 'github.com', owner: 'org', repo: 'repo' }
            });
            const context: RenderContext = { data: { cwd: '/tmp/repo' } };

            expect(widget.getValue(context, item)).toBe(true);
        });

        it('returns false when repo is not a fork', () => {
            vi.spyOn(gitRemote, 'getForkStatus').mockReturnValue({
                isFork: false,
                origin: { name: 'origin', url: 'git@github.com:org/repo.git', host: 'github.com', owner: 'org', repo: 'repo' },
                upstream: null
            });
            const context: RenderContext = { data: { cwd: '/tmp/repo' } };

            expect(widget.getValue(context, item)).toBe(false);
        });

        it('returns true in preview mode', () => {
            const context: RenderContext = { isPreview: true };

            expect(widget.getValue(context, item)).toBe(true);
        });
    });
});