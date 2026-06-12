import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { OutputStyleWidget } from '../OutputStyle';

function render(item: WidgetItem, context: RenderContext = {}): string | null {
    const widget = new OutputStyleWidget();
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('OutputStyleWidget', () => {
    it('renders the output style from status JSON', () => {
        expect(render(
            { id: 'output-style', type: 'output-style' },
            { data: { output_style: { name: 'Explanatory' } } }
        )).toBe('Style: Explanatory');
    });

    it('renders nothing when output style data is missing', () => {
        expect(render({ id: 'output-style', type: 'output-style' }, {})).toBeNull();
    });

    it('declares the default-value hideable state', () => {
        expect(new OutputStyleWidget().getHideableStates().map(state => state.key)).toEqual(['default-value']);
    });

    it('hides the default style only when the default-value hide state is enabled', () => {
        const context: RenderContext = { data: { output_style: { name: 'default' } } };

        expect(render({ id: 'output-style', type: 'output-style' }, context)).toBe('Style: default');
        expect(render({
            id: 'output-style',
            type: 'output-style',
            metadata: { hide: 'default-value' }
        }, context)).toBeNull();
        expect(render({
            id: 'output-style',
            type: 'output-style',
            metadata: { hide: 'default-value' }
        }, { data: { output_style: { name: 'Explanatory' } } })).toBe('Style: Explanatory');
    });
});
