import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../types/Settings';
import {
    filterWidgetCatalog,
    getWidget,
    getWidgetCatalog
} from '../../utils/widgets';

const EXTRA_USAGE_TYPES = ['extra-usage-used', 'extra-usage-remaining', 'extra-usage-utilization'];

// On a usage-based Enterprise plan there are no plan limits, so extra usage
// is all of the account's spend rather than overage beyond them
describe('Extra Usage widgets on Enterprise accounts', () => {
    it.each(EXTRA_USAGE_TYPES)('%s describes both overage and Enterprise spend', (type) => {
        const description = getWidget(type)?.getDescription() ?? '';

        expect(description).toContain('Pro/Max');
        expect(description).toContain('Enterprise');
    });

    it.each(['enterprise', 'spend'])('lists the Extra Usage widgets first when searching "%s"', (query) => {
        const types = filterWidgetCatalog(getWidgetCatalog(DEFAULT_SETTINGS), 'All', query).map(entry => entry.type);
        const firstOther = types.findIndex(type => !type.startsWith('extra-usage-'));
        const leading = firstOther === -1 ? types : types.slice(0, firstOther);

        expect(leading).toEqual(expect.arrayContaining(EXTRA_USAGE_TYPES));
    });
});
