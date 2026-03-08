import {
    describe,
    expect,
    it
} from 'vitest';

import { getUsageErrorMessage } from '../usage-windows';

describe('getUsageErrorMessage', () => {
    it('returns the rate-limited label', () => {
        expect(getUsageErrorMessage('rate-limited')).toBe('[Rate limited]');
    });
});