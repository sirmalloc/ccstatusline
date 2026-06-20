import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../types/Widget';
import {
    applyMergeTargetHiding,
    type PreRenderedWidget
} from '../renderer';

function element(
    type: string,
    content: string,
    overrides: Partial<WidgetItem> = {}
): PreRenderedWidget {
    return {
        content,
        plainLength: content.length,
        widget: { id: `${type}-${Math.random()}`, type, ...overrides }
    };
}

function hidingSymbol(content: string, merge?: WidgetItem['merge']): PreRenderedWidget {
    return element('custom-symbol', content, {
        merge,
        metadata: { hide: 'merge-target-hidden' }
    });
}

describe('applyMergeTargetHiding', () => {
    it('hides a merged decorative prefix when its target rendered nothing', () => {
        const line = [hidingSymbol('★', true), element('git-branch', '')];

        applyMergeTargetHiding(line);

        expect(line[0]?.content).toBe('');
        expect(line[0]?.plainLength).toBe(0);
    });

    it('keeps the decorative prefix when its target rendered content', () => {
        const line = [hidingSymbol('★', true), element('git-branch', '⎇ main')];

        applyMergeTargetHiding(line);

        expect(line[0]?.content).toBe('★');
    });

    it('keeps decoratives that did not opt into merge-target-hidden', () => {
        const line = [element('custom-symbol', '★', { merge: true }), element('git-branch', '')];

        applyMergeTargetHiding(line);

        expect(line[0]?.content).toBe('★');
    });

    it('hides a decorative suffix when the widget merging into it rendered nothing', () => {
        const line = [element('git-branch', '', { merge: true }), hidingSymbol('★')];

        applyMergeTargetHiding(line);

        expect(line[1]?.content).toBe('');
    });

    it('collapses a fully merged chain as a unit', () => {
        const line = [
            hidingSymbol('★', 'no-padding'),
            element('git-branch', '', { merge: 'no-padding' }),
            hidingSymbol('✦')
        ];

        applyMergeTargetHiding(line);

        expect(line.map(el => el.content)).toEqual(['', '', '']);
    });

    it('targets the nearest non-decorative widget in merge direction', () => {
        const line = [
            hidingSymbol('★', true),
            element('tokens-total', '', { merge: true }),
            hidingSymbol('✦', true),
            element('git-branch', '⎇ main')
        ];

        applyMergeTargetHiding(line);

        // ★ belongs to the hidden tokens widget; ✦ belongs to the visible branch
        expect(line[0]?.content).toBe('');
        expect(line[2]?.content).toBe('✦');
    });

    it('leaves unmerged decoratives alone even when the state is enabled', () => {
        const line = [hidingSymbol('★'), element('git-branch', '')];

        applyMergeTargetHiding(line);

        expect(line[0]?.content).toBe('★');
    });

    it('honors the legacy-free unified metadata only for decorative types', () => {
        const line = [
            element('git-sha', 'abc1234', { merge: true, metadata: { hide: 'merge-target-hidden' } }),
            element('git-branch', '')
        ];

        applyMergeTargetHiding(line);

        expect(line[0]?.content).toBe('abc1234');
    });

    it('skips separator elements when pairing merged items', () => {
        const line = [
            hidingSymbol('★', true),
            element('separator', ''),
            element('git-branch', '')
        ];

        applyMergeTargetHiding(line);

        expect(line[0]?.content).toBe('');
    });
});
