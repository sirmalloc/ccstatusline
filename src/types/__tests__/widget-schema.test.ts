import {
    describe,
    expect,
    it
} from 'vitest';

import { WidgetItemSchema } from '../Widget';

describe('WidgetItemSchema pin flags', () => {
    it('accepts pinColor and pinBackgroundColor', () => {
        const parsed = WidgetItemSchema.parse({
            id: 'w1', type: 'model', color: 'red',
            pinColor: true, pinBackgroundColor: false
        });
        expect(parsed.pinColor).toBe(true);
        expect(parsed.pinBackgroundColor).toBe(false);
    });

    it('loads a config without pin fields (existing settings, no migration)', () => {
        const parsed = WidgetItemSchema.parse({ id: 'w1', type: 'model', color: 'red' });
        expect(parsed.pinColor).toBeUndefined();
        expect(parsed.pinBackgroundColor).toBeUndefined();
    });
});
