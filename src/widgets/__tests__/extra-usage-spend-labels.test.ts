import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getWidget } from '../../utils/widgets';

// An account without plan limits: its spend, against a $40.00 limit
const SPEND_ACCOUNT: RenderContext = {
    usageData: {
        extraUsageEnabled: true,
        extraUsageUsed: 1250,
        extraUsageLimit: 4000,
        extraUsageUtilization: 31.25,
        extraUsageCurrency: 'USD',
        noPlanLimits: true
    }
};

// The label editor has no usage data, so it offers the Overage label; an edited
// label replaces whichever one the account would show
describe.each([
    ['extra-usage-used', 'Overage Used: ', 'Spend Used: '],
    ['extra-usage-remaining', 'Overage Left: ', 'Spend Left: '],
    ['extra-usage-utilization', 'Overage: ', 'Spend: ']
])('%s label', (type, editorDefault, spendLabel) => {
    const widget = getWidget(type);
    const item: WidgetItem = { id: 'w', type };
    const render = (target: WidgetItem) => widget?.render(target, SPEND_ACCOUNT, DEFAULT_SETTINGS) ?? '';

    it('offers the Overage label to the label editor', () => {
        expect(widget?.getLabelPrefix?.(item)).toBe(editorDefault);
    });

    it('shows the Spend label until it is edited', () => {
        expect(render(item).startsWith(spendLabel)).toBe(true);
        expect(render({ ...item, metadata: { label: 'x ' } }).startsWith('x ')).toBe(true);
        expect(render({ ...item, metadata: { label: '' } }).startsWith(spendLabel)).toBe(false);
    });
});
