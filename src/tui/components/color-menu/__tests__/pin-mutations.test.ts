import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../../types/Widget';
import {
    clearAllPins,
    clearAllWidgetStyling,
    cycleWidgetColor,
    pinWidgetColor,
    resetWidgetStyling,
    unpinWidgetColor
} from '../mutations';

describe('pin / unpin widget colour mutations', () => {
    it('pin surfaces an existing colour without overwriting it', () => {
        const w: WidgetItem[] = [{ id: 'w1', type: 'model', color: 'red' }];
        const out = pinWidgetColor(w, 'w1', false, 'cyan');
        expect(out[0]?.pinColor).toBe(true);
        expect(out[0]?.color).toBe('red'); // seed ignored because a colour already exists
    });

    it('pin seeds the colour when none is set', () => {
        const w: WidgetItem[] = [{ id: 'w1', type: 'model' }];
        const out = pinWidgetColor(w, 'w1', false, 'cyan');
        expect(out[0]?.pinColor).toBe(true);
        expect(out[0]?.color).toBe('cyan');
    });

    it('pin targets background independently', () => {
        const w: WidgetItem[] = [{ id: 'w1', type: 'model', color: 'red' }];
        const out = pinWidgetColor(w, 'w1', true, 'blue');
        expect(out[0]?.pinBackgroundColor).toBe(true);
        expect(out[0]?.backgroundColor).toBe('blue');
        expect(out[0]?.pinColor).toBeUndefined(); // fg untouched
    });

    it('unpin clears the flag but keeps the colour', () => {
        const w: WidgetItem[] = [{ id: 'w1', type: 'model', color: 'blue', pinColor: true }];
        const out = unpinWidgetColor(w, 'w1', false);
        expect(out[0]?.pinColor).toBeFalsy();
        expect(out[0]?.color).toBe('blue'); // NOT an undo — colour stays
    });

    it('clearAllPins removes pins from all widgets, keeps colours', () => {
        const w: WidgetItem[] = [
            { id: 'w1', type: 'model', color: 'red', pinColor: true },
            { id: 'w2', type: 'git-branch', backgroundColor: 'blue', pinBackgroundColor: true }
        ];
        const out = clearAllPins(w);
        expect(out[0]?.pinColor).toBeFalsy();
        expect(out[1]?.pinBackgroundColor).toBeFalsy();
        expect(out[0]?.color).toBe('red');
        expect(out[1]?.backgroundColor).toBe('blue');
    });

    it('does not mutate the input array or widgets', () => {
        const w: WidgetItem[] = [{ id: 'w1', type: 'model', color: 'red' }];
        pinWidgetColor(w, 'w1', false, 'cyan');
        expect(w[0]?.pinColor).toBeUndefined();
    });
});

describe('reset / clear-all also drop pins', () => {
    it('resetWidgetStyling clears pins as well as colours', () => {
        const w: WidgetItem[] = [{
            id: 'w1', type: 'model', color: 'red', backgroundColor: 'blue',
            pinColor: true, pinBackgroundColor: true, bold: true
        }];
        const out = resetWidgetStyling(w, 'w1', false);
        expect(out[0]?.pinColor).toBeUndefined();
        expect(out[0]?.pinBackgroundColor).toBeUndefined();
        expect(out[0]?.color).toBeUndefined();
        expect(out[0]?.backgroundColor).toBeUndefined();
    });

    it('clearAllWidgetStyling clears pins on every widget', () => {
        const w: WidgetItem[] = [
            { id: 'w1', type: 'model', color: 'red', pinColor: true },
            { id: 'w2', type: 'git-branch', backgroundColor: 'blue', pinBackgroundColor: true }
        ];
        const out = clearAllWidgetStyling(w, false);
        expect(out[0]?.pinColor).toBeUndefined();
        expect(out[1]?.pinBackgroundColor).toBeUndefined();
        expect(out[0]?.color).toBeUndefined();
        expect(out[1]?.backgroundColor).toBeUndefined();
    });
});

describe('reset / clear-all under an active theme', () => {
    it('resetWidgetStyling keeps a colour the theme is hiding', () => {
        const w: WidgetItem[] = [{
            id: 'w1',
            type: 'model',
            color: 'red',
            backgroundColor: 'blue',
            bold: true,
            dim: true
        }];
        const out = resetWidgetStyling(w, 'w1', true);

        // Unpinned channels are invisible under the theme, so wiping them would destroy a
        // value the user cannot see. Bold and dim are never theme-driven, so they still go.
        expect(out[0]?.color).toBe('red');
        expect(out[0]?.backgroundColor).toBe('blue');
        expect(out[0]?.bold).toBeUndefined();
        expect(out[0]?.dim).toBeUndefined();
    });

    it('resetWidgetStyling clears a pinned channel and leaves the unpinned one', () => {
        const w: WidgetItem[] = [{
            id: 'w1',
            type: 'model',
            color: 'red',
            pinColor: true,
            backgroundColor: 'blue'
        }];
        const out = resetWidgetStyling(w, 'w1', true);

        expect(out[0]?.color).toBeUndefined();
        expect(out[0]?.pinColor).toBeUndefined();
        expect(out[0]?.backgroundColor).toBe('blue');
    });

    it('clearAllWidgetStyling spares theme-hidden colours across the line', () => {
        const w: WidgetItem[] = [
            { id: 'w1', type: 'model', color: 'red' },
            {
                id: 'w2',
                type: 'git-branch',
                backgroundColor: 'blue',
                pinBackgroundColor: true
            }
        ];
        const out = clearAllWidgetStyling(w, true);

        expect(out[0]?.color).toBe('red');
        expect(out[1]?.backgroundColor).toBeUndefined();
        expect(out[1]?.pinBackgroundColor).toBeUndefined();
    });
});

describe('a pinned channel always keeps a colour', () => {
    const PALETTE_WITH_DEFAULT = ['', 'red', 'blue'];

    it('does not leave a pinned foreground with no colour', () => {
        const w: WidgetItem[] = [{
            id: 'w1',
            type: 'model',
            color: 'blue',
            pinColor: true
        }];
        const out = cycleWidgetColor({
            widgets: w,
            widgetId: 'w1',
            direction: 'right',
            editingBackground: false,
            colors: PALETTE_WITH_DEFAULT,
            backgroundColors: []
        });

        // 'blue' is last, so wrapping would land on the palette's empty "Default" entry -
        // which under a pin means no theme colour and no colour of its own.
        expect(out[0]?.color).toBe('red');
        expect(out[0]?.pinColor).toBe(true);
    });

    it('does not leave a pinned background with no colour', () => {
        const w: WidgetItem[] = [{
            id: 'w1',
            type: 'model',
            backgroundColor: 'blue',
            pinBackgroundColor: true
        }];
        const out = cycleWidgetColor({
            widgets: w,
            widgetId: 'w1',
            direction: 'right',
            editingBackground: true,
            colors: [],
            backgroundColors: PALETTE_WITH_DEFAULT
        });

        expect(out[0]?.backgroundColor).toBe('red');
        expect(out[0]?.pinBackgroundColor).toBe(true);
    });

    it('still offers the default entry when the channel is not pinned', () => {
        const w: WidgetItem[] = [{
            id: 'w1',
            type: 'model',
            backgroundColor: 'blue'
        }];
        const out = cycleWidgetColor({
            widgets: w,
            widgetId: 'w1',
            direction: 'right',
            editingBackground: true,
            colors: [],
            backgroundColors: PALETTE_WITH_DEFAULT
        });

        expect(out[0]?.backgroundColor).toBeUndefined();
    });
});
