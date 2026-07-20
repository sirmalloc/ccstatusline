import {
    describe,
    expect,
    it
} from 'vitest';

import { computeCiRollup } from '../git-review-cache';

const pass = { status: 'COMPLETED', conclusion: 'SUCCESS' };
const fail = { status: 'COMPLETED', conclusion: 'FAILURE' };
const running = { status: 'IN_PROGRESS', conclusion: '' };
const neutral = { status: 'COMPLETED', conclusion: 'NEUTRAL' };
const skipped = { status: 'COMPLETED', conclusion: 'SKIPPED' };
const statusPass = { state: 'SUCCESS' };
const statusFail = { state: 'FAILURE' };
const statusPending = { state: 'PENDING' };

describe('computeCiRollup', () => {
    it.each([
        ['all passing check runs', [pass, pass, pass], { state: 'passing', failing: 0, pending: 0, success: 3 }],
        ['a failure makes it failing', [pass, fail, pass], { state: 'failing', failing: 1, pending: 0, success: 2 }],
        ['a pending run makes it pending', [pass, running], { state: 'pending', failing: 0, pending: 1, success: 1 }],
        ['failure takes precedence over pending', [fail, running, pass], { state: 'failing', failing: 1, pending: 1, success: 1 }],
        ['neutral and skipped are ignored (not counted as success)', [pass, neutral, skipped], { state: 'passing', failing: 0, pending: 0, success: 1 }],
        ['StatusContext success counts as success', [statusPass, statusPass], { state: 'passing', failing: 0, pending: 0, success: 2 }],
        ['StatusContext failure counts as failing', [statusPass, statusFail], { state: 'failing', failing: 1, pending: 0, success: 1 }],
        ['StatusContext pending counts as pending', [statusPass, statusPending], { state: 'pending', failing: 0, pending: 1, success: 1 }],
        ['the screenshot mix (1 fail, 1 neutral, 1 pending, 2 skipped, 4 success)', [fail, neutral, running, skipped, skipped, pass, pass, pass, pass], { state: 'failing', failing: 1, pending: 1, success: 4 }]
    ])('%s', (_label, rollup, expected) => {
        expect(computeCiRollup(rollup)).toEqual(expected);
    });

    it.each([
        ['empty array', []],
        ['non-array', null],
        ['undefined', undefined],
        ['string', 'nope']
    ])('returns null for %s', (_label, input) => {
        expect(computeCiRollup(input)).toBeNull();
    });
});
