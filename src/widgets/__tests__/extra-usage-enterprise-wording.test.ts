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

    // Every widget that mentions the word ranks ahead of the loose fuzzy matches,
    // so the three are listed before anything unrelated
    it.each(['enterprise', 'spend'])('finds the Extra Usage widgets among the widgets that mention "%s"', (query) => {
        const results = filterWidgetCatalog(getWidgetCatalog(DEFAULT_SETTINGS), 'All', query);
        const firstLoose = results.findIndex(entry => !entry.searchText.includes(query));
        const mentioning = (firstLoose === -1 ? results : results.slice(0, firstLoose)).map(entry => entry.type);

        expect(mentioning).toEqual(expect.arrayContaining(EXTRA_USAGE_TYPES));
    });
});
