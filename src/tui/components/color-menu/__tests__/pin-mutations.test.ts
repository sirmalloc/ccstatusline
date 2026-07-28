import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../../types/Widget';
import {
    clearAllPins,
    clearAllWidgetStyling,
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
        const out = resetWidgetStyling(w, 'w1');
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
        const out = clearAllWidgetStyling(w);
        expect(out[0]?.pinColor).toBeUndefined();
        expect(out[1]?.pinBackgroundColor).toBeUndefined();
        expect(out[0]?.color).toBeUndefined();
        expect(out[1]?.backgroundColor).toBeUndefined();
    });
});
