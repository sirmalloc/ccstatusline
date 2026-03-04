import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { WidgetItem } from '../../types/Widget';
import { fetchUsageData } from '../usage';
import {
    hasUsageDependentWidgets,
    prefetchUsageDataIfNeeded
} from '../usage-prefetch';

vi.mock('../usage', () => ({ fetchUsageData: vi.fn() }));

const mockFetchUsageData = fetchUsageData as unknown as {
    mockClear: () => void;
    mockResolvedValue: (value: unknown) => void;
    mock: { calls: unknown[][] };
};

function makeLines(...lineItems: WidgetItem[][]): WidgetItem[][] {
    return lineItems;
}

describe('usage prefetch', () => {
    it('detects when usage widgets are present', () => {
        const lines = makeLines(
            [{ id: '1', type: 'model' }],
            [{ id: '2', type: 'block-timer' }]
        );

        expect(hasUsageDependentWidgets(lines)).toBe(true);
    });

    it('does not detect usage requirement for non-usage widgets', () => {
        const lines = makeLines(
            [{ id: '1', type: 'model' }],
            [{ id: '2', type: 'git-branch' }]
        );

        expect(hasUsageDependentWidgets(lines)).toBe(false);
    });

    it('fetches usage data once when at least one usage widget exists', async () => {
        mockFetchUsageData.mockClear();
        mockFetchUsageData.mockResolvedValue({ sessionUsage: 12.3 });

        const lines = makeLines(
            [{ id: '1', type: 'model' }],
            [{ id: '2', type: 'session-usage' }, { id: '3', type: 'weekly-usage' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines);

        expect(usageData).toEqual({ sessionUsage: 12.3 });
        expect(mockFetchUsageData.mock.calls.length).toBe(1);
    });

    it('does not fetch usage data when no usage widgets exist', async () => {
        mockFetchUsageData.mockClear();

        const lines = makeLines(
            [{ id: '1', type: 'model' }],
            [{ id: '2', type: 'git-branch' }]
        );

        const usageData = await prefetchUsageDataIfNeeded(lines);

        expect(usageData).toBeNull();
        expect(mockFetchUsageData.mock.calls.length).toBe(0);
    });
});