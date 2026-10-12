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
});
