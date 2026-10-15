import {
    describe,
    expect,
    it
} from 'vitest';

import { StatusJSONSchema } from '../StatusJSON';

describe('StatusJSONSchema numeric coercion', () => {
    it('coerces numeric strings to numbers', () => {
        const result = StatusJSONSchema.safeParse({
            cost: {
                total_cost_usd: '1.25',
                total_duration_ms: '12345',
                total_api_duration_ms: '2345',
                total_lines_added: '12',
                total_lines_removed: '3'
            },
            context_window: {
                context_window_size: '200000',
                total_input_tokens: '1200',
                total_output_tokens: '340',
                current_usage: {
                    input_tokens: '100',
                    output_tokens: '50',
                    cache_creation_input_tokens: '20',
                    cache_read_input_tokens: '10'
                },
                used_percentage: '9.3',
                remaining_percentage: '90.7'
            }
        });

        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }

        expect(result.data.cost?.total_duration_ms).toBe(12345);
        expect(result.data.context_window?.context_window_size).toBe(200000);
        expect(result.data.context_window?.current_usage).toEqual({
            input_tokens: 100,
            output_tokens: 50,
            cache_creation_input_tokens: 20,
            cache_read_input_tokens: 10
        });
        expect(result.data.context_window?.used_percentage).toBe(9.3);
    });

    it('keeps invalid numeric strings rejected', () => {
        const result = StatusJSONSchema.safeParse({ context_window: { context_window_size: 'not-a-number' } });

        expect(result.success).toBe(false);
    });

    it('keeps empty numeric strings rejected', () => {
        const result = StatusJSONSchema.safeParse({ context_window: { context_window_size: '' } });

        expect(result.success).toBe(false);
    });

    it('accepts null vim payloads', () => {
        const result = StatusJSONSchema.safeParse({ vim: null });

        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }

        expect(result.data.vim).toBeNull();
    });

    it('accepts null version, cost, workspace and output_style payloads', () => {
        const result = StatusJSONSchema.safeParse({
            model: { id: 'claude-opus-4-6' },
            version: null,
            cost: null,
            workspace: null,
            output_style: null
        });

        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }

        expect(result.data.version).toBeNull();
        expect(result.data.cost).toBeNull();
        expect(result.data.workspace).toBeNull();
        expect(result.data.output_style).toBeNull();
        expect(result.data.model).toEqual({ id: 'claude-opus-4-6' });
    });

    it('parses rate_limits with valid data', () => {
        const result = StatusJSONSchema.safeParse({
            rate_limits: {
                five_hour: { used_percentage: 42, resets_at: 1774020000 },
                seven_day: { used_percentage: 15, resets_at: 1774540000 }
            }
        });

        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }

        expect(result.data.rate_limits?.five_hour?.used_percentage).toBe(42);
        expect(result.data.rate_limits?.five_hour?.resets_at).toBe(1774020000);
        expect(result.data.rate_limits?.seven_day?.used_percentage).toBe(15);
        expect(result.data.rate_limits?.seven_day?.resets_at).toBe(1774540000);
    });

    it('accepts null rate_limits', () => {
        const result = StatusJSONSchema.safeParse({ rate_limits: null });

        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }

        expect(result.data.rate_limits).toBeNull();
    });

    it('coerces rate_limits string numbers', () => {
        const result = StatusJSONSchema.safeParse({ rate_limits: { five_hour: { used_percentage: '42', resets_at: '1774020000' } } });

        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }

        expect(result.data.rate_limits?.five_hour?.used_percentage).toBe(42);
        expect(result.data.rate_limits?.five_hour?.resets_at).toBe(1774020000);
    });

    it('parses rate_limits.spend_limit with the optional dollar fields', () => {
        const result = StatusJSONSchema.safeParse({
            rate_limits: {
                spend_limit: {
                    used_percentage: 62.8,
                    resets_at: 1740787200,
                    used_usd: 314.12,
                    limit_usd: 500,
                    period: 'monthly'
                }
            }
        });

        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }

        expect(result.data.rate_limits?.spend_limit).toEqual({
            used_percentage: 62.8,
            resets_at: 1740787200,
            used_usd: 314.12,
            limit_usd: 500,
            period: 'monthly'
        });
    });

    it('accepts rate_limits.spend_limit without the dollar fields', () => {
        const result = StatusJSONSchema.safeParse({ rate_limits: { spend_limit: { used_percentage: 12, resets_at: 1740787200 } } });

        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }

        expect(result.data.rate_limits?.spend_limit?.used_percentage).toBe(12);
        expect(result.data.rate_limits?.spend_limit?.used_usd).toBeUndefined();
    });

    it('parses prompt_cache with every documented field', () => {
        const result = StatusJSONSchema.safeParse({
            prompt_cache: {
                warm: true,
                caching_observed: true,
                ttl: '1h',
                expires_at: 1738429200,
                requests: 14,
                misses: '2',
                expected_rebuilds: 1,
                hit_ratio: 0.91,
                cache_write_tokens: 352000,
                miss_recache_tokens: 310200,
                last_miss_at: 1738425230,
                last_miss_cause: { causes: ['tools_changed'], tools_added: 2, tools_removed: 0 },
                miss_causes: { tools_changed: 2 },
                recache_tokens_if_cold: 45000
            }
        });

        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }

        expect(result.data.prompt_cache).toEqual({
            warm: true,
            caching_observed: true,
            ttl: '1h',
            expires_at: 1738429200,
            requests: 14,
            misses: 2,
            expected_rebuilds: 1,
            hit_ratio: 0.91,
            cache_write_tokens: 352000,
            miss_recache_tokens: 310200,
            last_miss_at: 1738425230,
            last_miss_cause: { causes: ['tools_changed'], tools_added: 2, tools_removed: 0 },
            miss_causes: { tools_changed: 2 },
            recache_tokens_if_cold: 45000
        });
    });

    it('accepts the nulls prompt_cache documents', () => {
        const promptCache = { expires_at: null, hit_ratio: null, last_miss_at: null, last_miss_cause: null, recache_tokens_if_cold: null };
        const result = StatusJSONSchema.safeParse({ prompt_cache: promptCache });

        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }

        expect(result.data.prompt_cache?.last_miss_at).toBeNull();
        expect(result.data.prompt_cache?.last_miss_cause).toBeNull();
    });

    // The status line keeps rendering when Claude Code sends a prompt_cache
    // field in a shape this version doesn't know
    it('drops a malformed prompt_cache field instead of rejecting the payload', () => {
        const result = StatusJSONSchema.safeParse({
            model: { display_name: 'Opus' },
            prompt_cache: {
                requests: 14,
                misses: 'several',
                last_miss_cause: 'tools_changed',
                miss_causes: { tools_changed: 'two' }
            }
        });

        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }

        expect(result.data.model).toEqual({ display_name: 'Opus' });
        expect(result.data.prompt_cache?.requests).toBe(14);
        expect(result.data.prompt_cache?.misses).toBeUndefined();
        expect(result.data.prompt_cache?.last_miss_cause).toBeUndefined();
        expect(result.data.prompt_cache?.miss_causes).toBeUndefined();
    });

    it('drops a prompt_cache that is not an object instead of rejecting the payload', () => {
        const result = StatusJSONSchema.safeParse({ model: { display_name: 'Opus' }, prompt_cache: 42 });

        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }

        expect(result.data.model).toEqual({ display_name: 'Opus' });
        expect(result.data.prompt_cache).toBeUndefined();
    });
});
