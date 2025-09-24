import {
    describe,
    expect,
    it
} from 'vitest';

function createMockTimestamps(timestamps: string[]): string {
    return timestamps.map(ts => JSON.stringify({
        timestamp: ts,
        message: {
            usage: {
                input_tokens: 100,
                output_tokens: 50
            }
        }
    })).join('\n');
}

function floorToHour(timestamp: Date): Date {
    const floored = new Date(timestamp);
    floored.setUTCMinutes(0, 0, 0);
    return floored;
}

function getAllTimestampsFromContent(content: string): Date[] {
    const timestamps: Date[] = [];
    const lines = content.trim().split('\n').filter(line => line.length > 0);

    for (const line of lines) {
        try {
            const json = JSON.parse(line) as {
                timestamp?: string;
                isSidechain?: boolean;
                message?: { usage?: { input_tokens?: number; output_tokens?: number } };
            };

            const usage = json.message?.usage;
            if (!usage)
                continue;

            const hasInputTokens = typeof usage.input_tokens === 'number';
            const hasOutputTokens = typeof usage.output_tokens === 'number';
            if (!hasInputTokens || !hasOutputTokens)
                continue;

            if (json.isSidechain === true)
                continue;

            const timestamp = json.timestamp;
            if (typeof timestamp !== 'string')
                continue;

            const date = new Date(timestamp);
            if (!Number.isNaN(date.getTime()))
                timestamps.push(date);
        } catch {
            continue;
        }
    }

    return timestamps;
}

function findBlockStartTime(
    content: string,
    currentTime: Date,
    sessionDurationHours = 5
): Date | null {
    const sessionDurationMs = sessionDurationHours * 60 * 60 * 1000;
    const now = currentTime;

    const timestamps = getAllTimestampsFromContent(content);

    if (timestamps.length === 0)
        return null;

    timestamps.sort((a, b) => b.getTime() - a.getTime());

    const mostRecentTimestamp = timestamps[0];
    if (!mostRecentTimestamp)
        return null;

    const timeSinceLastActivity = now.getTime() - mostRecentTimestamp.getTime();
    if (timeSinceLastActivity > sessionDurationMs) {
        return null;
    }

    let continuousWorkStart = mostRecentTimestamp;
    for (let i = 1; i < timestamps.length; i++) {
        const currentTimestamp = timestamps[i];
        const previousTimestamp = timestamps[i - 1];

        if (!currentTimestamp || !previousTimestamp)
            continue;

        const gap = previousTimestamp.getTime() - currentTimestamp.getTime();

        if (gap >= sessionDurationMs) {
            break;
        }

        continuousWorkStart = currentTimestamp;
    }

    const blocks: { start: Date; end: Date }[] = [];
    const sortedTimestamps = timestamps.slice().sort((a, b) => a.getTime() - b.getTime());

    let currentBlockStart: Date | null = null;
    let currentBlockEnd: Date | null = null;

    for (const timestamp of sortedTimestamps) {
        if (timestamp.getTime() < continuousWorkStart.getTime())
            continue;

        if (!currentBlockStart || (currentBlockEnd && timestamp.getTime() > currentBlockEnd.getTime())) {
            currentBlockStart = floorToHour(timestamp);
            currentBlockEnd = new Date(currentBlockStart.getTime() + sessionDurationMs);
            blocks.push({ start: currentBlockStart, end: currentBlockEnd });
        }
    }

    for (const block of blocks) {
        if (now.getTime() >= block.start.getTime() && now.getTime() <= block.end.getTime()) {
            const hasActivity = timestamps.some(t => t.getTime() >= block.start.getTime()
                && t.getTime() <= block.end.getTime()
            );

            if (hasActivity) {
                return block.start;
            }
        }
    }

    return null;
}

describe('Block Detection Algorithm', () => {
    describe('Real scenario bug fix', () => {
        it('should correctly handle morning and evening blocks with gap', () => {
            const content = createMockTimestamps([
                '2025-09-23T09:42:18.000Z',
                '2025-09-23T12:52:31.000Z',
                '2025-09-23T15:44:16.000Z',
                '2025-09-23T16:57:24.000Z'
            ]);

            const currentTime = new Date('2025-09-23T18:10:00.000Z');
            const result = findBlockStartTime(content, currentTime);

            expect(result).not.toBeNull();
            expect(result?.toISOString()).toBe('2025-09-23T15:00:00.000Z');
        });
    });

    describe('Multiple messages in single block', () => {
        it('should create single block for messages within 5 hours', () => {
            const content = createMockTimestamps([
                '2025-09-23T08:15:00.000Z',
                '2025-09-23T08:45:00.000Z',
                '2025-09-23T09:30:00.000Z',
                '2025-09-23T10:00:00.000Z'
            ]);

            const currentTime = new Date('2025-09-23T11:30:00.000Z');
            const result = findBlockStartTime(content, currentTime);

            expect(result).not.toBeNull();
            expect(result?.toISOString()).toBe('2025-09-23T08:00:00.000Z');
        });
    });

    describe('Multiple blocks with gaps', () => {
        it('should correctly identify current block in multi-block scenario', () => {
            const content = createMockTimestamps([
                '2025-09-22T22:13:00.000Z',
                '2025-09-23T03:56:00.000Z',
                '2025-09-23T04:01:00.000Z',
                '2025-09-23T12:33:00.000Z',
                '2025-09-23T18:01:00.000Z'
            ]);

            const currentTime = new Date('2025-09-23T20:43:00.000Z');
            const result = findBlockStartTime(content, currentTime);

            expect(result).not.toBeNull();
            expect(result?.toISOString()).toBe('2025-09-23T18:00:00.000Z');
        });
    });

    describe('Edge cases', () => {
        it('should return null when current time is in gap between blocks', () => {
            const content = createMockTimestamps([
                '2025-09-23T08:00:00.000Z',
                '2025-09-23T10:00:00.000Z'
            ]);

            const currentTime = new Date('2025-09-23T14:00:00.000Z');
            const result = findBlockStartTime(content, currentTime);

            expect(result).toBeNull();
        });

        it('should return null when no messages within 5 hours', () => {
            const content = createMockTimestamps([
                '2025-09-23T08:00:00.000Z'
            ]);

            const currentTime = new Date('2025-09-23T14:00:00.000Z');
            const result = findBlockStartTime(content, currentTime);

            expect(result).toBeNull();
        });

        it('should handle block boundary correctly', () => {
            const content = createMockTimestamps([
                '2025-09-23T10:30:00.000Z'
            ]);

            const currentTime = new Date('2025-09-23T15:00:00.000Z');
            const result = findBlockStartTime(content, currentTime);

            expect(result).not.toBeNull();
            expect(result?.toISOString()).toBe('2025-09-23T10:00:00.000Z');
        });

        it('should detect 5+ hour gap as boundary', () => {
            const content = createMockTimestamps([
                '2025-09-23T08:00:00.000Z',
                '2025-09-23T13:01:00.000Z'
            ]);

            const currentTime = new Date('2025-09-23T15:00:00.000Z');
            const result = findBlockStartTime(content, currentTime);

            expect(result).not.toBeNull();
            expect(result?.toISOString()).toBe('2025-09-23T13:00:00.000Z');
        });

        it('should handle messages at exact hour boundaries', () => {
            const content = createMockTimestamps([
                '2025-09-23T10:00:00.000Z',
                '2025-09-23T12:00:00.000Z'
            ]);

            const currentTime = new Date('2025-09-23T13:30:00.000Z');
            const result = findBlockStartTime(content, currentTime);

            expect(result).not.toBeNull();
            expect(result?.toISOString()).toBe('2025-09-23T10:00:00.000Z');
        });
    });

    describe('Invalid inputs', () => {
        it('should return null for empty content', () => {
            const result = findBlockStartTime('', new Date());
            expect(result).toBeNull();
        });

        it('should return null for invalid JSON', () => {
            const result = findBlockStartTime('not json', new Date());
            expect(result).toBeNull();
        });
    });
});