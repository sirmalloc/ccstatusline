import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../../types/Widget';
import { placePickerSelection } from '../picker-selection';

const model: WidgetItem = { id: 'a', type: 'model', color: 'red' };
const tokens: WidgetItem = { id: 'b', type: 'tokens-input' };
const newWidget = { id: 'new', backgroundColor: 'bgBlue' };

describe('placePickerSelection', () => {
    it('adds the new widget after the cursor', () => {
        expect(placePickerSelection([model, tokens], 'add', 0, 'git-branch', newWidget)).toEqual({
            widgets: [model, { id: 'new', type: 'git-branch', backgroundColor: 'bgBlue' }, tokens],
            selectedIndex: 1
        });
    });

    it('inserts the new widget before the cursor', () => {
        expect(placePickerSelection([model, tokens], 'insert', 1, 'git-branch', newWidget)).toEqual({
            widgets: [model, { id: 'new', type: 'git-branch', backgroundColor: 'bgBlue' }, tokens],
            selectedIndex: 1
        });
    });

    it('adds the new widget as the only item on an empty line', () => {
        expect(placePickerSelection([], 'add', 0, 'git-branch', newWidget)).toEqual({
            widgets: [{ id: 'new', type: 'git-branch', backgroundColor: 'bgBlue' }],
            selectedIndex: 0
        });
    });

    // A label names the old widget's value, e.g. "Model: " on Session Cost
    it('drops the label when the type changes, and keeps it when the type stays', () => {
        const labeled: WidgetItem = { ...model, metadata: { label: 'M ', hide: 'zero' } };

        expect(placePickerSelection([labeled, tokens], 'change', 0, 'git-branch', newWidget).widgets[0]).toEqual({ id: 'a', type: 'git-branch', color: 'red', metadata: { hide: 'zero' } });
        expect(placePickerSelection([labeled, tokens], 'change', 0, 'model', newWidget).widgets[0]).toEqual(labeled);
    });

    it('changes the type of the widget at the cursor and keeps its other settings', () => {
        expect(placePickerSelection([model, tokens], 'change', 0, 'git-branch', newWidget)).toEqual({
            widgets: [{ id: 'a', type: 'git-branch', color: 'red' }, tokens],
            selectedIndex: 0
        });
    });

    it('leaves the line unchanged when changing with no widget at the cursor', () => {
        expect(placePickerSelection([], 'change', 0, 'git-branch', newWidget)).toEqual({
            widgets: [],
            selectedIndex: 0
        });
    });

    it('does not mutate the input line', () => {
        const line = [model, tokens];
        placePickerSelection(line, 'add', 0, 'git-branch', newWidget);
        placePickerSelection(line, 'change', 1, 'git-branch', newWidget);
        expect(line).toEqual([{ id: 'a', type: 'model', color: 'red' }, { id: 'b', type: 'tokens-input' }]);
    });
});
