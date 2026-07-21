import {
    describe,
    expect,
    it
} from 'vitest';

import { parseZaiQuotaResponse } from '../usage-fetch';

// Captured live from https://api.z.ai/api/monitor/usage/quota/limit
const ZAI_QUOTA_PAYLOAD = JSON.stringify({
    code: 200,
    msg: 'Operation successful',
    data: {
        level: 'lite',
        limits: [
            { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 33, nextResetTime: 1784135390008 },
            { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 6, nextResetTime: 1784721981974 },
            {
                type: 'TIME_LIMIT',
                unit: 5,
                number: 1,
                usage: 100,
                currentValue: 0,
                remaining: 100,
                percentage: 0,
                nextResetTime: 1786795581971,
                usageDetails: [{ modelCode: 'search-prime', usage: 0 }]
            }
        ]
    },
    success: true
});

describe('parseZaiQuotaResponse', () => {
    it('maps the 5-hour token window to session usage', () => {
        const data = parseZaiQuotaResponse(ZAI_QUOTA_PAYLOAD);
        expect(data?.sessionUsage).toBe(33);
        expect(data?.sessionResetAt).toBe(new Date(1784135390008).toISOString());
    });

    it('maps the 1-month token window to monthly usage (not weekly)', () => {
        const data = parseZaiQuotaResponse(ZAI_QUOTA_PAYLOAD);
        expect(data?.monthlyUsage).toBe(6);
        expect(data?.monthlyResetAt).toBe(new Date(1784721981974).toISOString());
        // The monthly window must not leak into the weekly (7-day) fields, which
        // only Anthropic populates.
        expect(data?.weeklyUsage).toBeUndefined();
        expect(data?.weeklyResetAt).toBeUndefined();
    });

    it('maps the monthly MCP time limit to extra usage utilization', () => {
        const data = parseZaiQuotaResponse(ZAI_QUOTA_PAYLOAD);
        expect(data?.extraUsageUtilization).toBe(0);
        expect(data?.extraUsageEnabled).toBe(true);
    });

    it('does not populate per-model (Sonnet/Opus) fields ZAI does not expose', () => {
        const data = parseZaiQuotaResponse(ZAI_QUOTA_PAYLOAD);
        expect(data?.weeklySonnetUsage).toBeUndefined();
        expect(data?.weeklyOpusUsage).toBeUndefined();
    });

    it('returns null for an empty or malformed payload', () => {
        expect(parseZaiQuotaResponse('{}')).toBeNull();
        expect(parseZaiQuotaResponse('{"data":{"limits":[]}}')).toBeNull();
        expect(parseZaiQuotaResponse('not json')).toBeNull();
    });

    it('ignores limits with an unrecognized unit without throwing', () => {
        const payload = JSON.stringify({ data: { limits: [{ type: 'TOKENS_LIMIT', unit: 99, number: 1, percentage: 42, nextResetTime: 1784135390008 }] } });
        const data = parseZaiQuotaResponse(payload);
        expect(data?.sessionUsage).toBeUndefined();
        expect(data?.monthlyUsage).toBeUndefined();
    });
});
