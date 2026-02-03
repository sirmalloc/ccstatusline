import {
    describe,
    expect,
    it
} from 'vitest';

import type { SkillInvocation } from '../../types/SkillsMetrics';

import { computeSkillsMetrics } from '../skills';

function createMockInvocations(skills: { skill: string; timestamp: string; args?: string }[]): SkillInvocation[] {
    return skills.map((s, i) => ({
        timestamp: s.timestamp,
        session_id: 'test-session',
        skill: s.skill,
        args: s.args ?? ''
    }));
}

describe('Skills Metrics', () => {
    describe('computeSkillsMetrics', () => {
        it('should return empty metrics for empty invocations', () => {
            const result = computeSkillsMetrics([]);

            expect(result.totalInvocations).toBe(0);
            expect(result.uniqueSkills).toEqual([]);
            expect(result.lastSkill).toBeNull();
            expect(result.invocations).toEqual([]);
        });

        it('should count total invocations correctly', () => {
            const invocations = createMockInvocations([
                { skill: 'commit', timestamp: '2025-01-15T10:00:00Z' },
                { skill: 'review-pr', timestamp: '2025-01-15T10:05:00Z' },
                { skill: 'commit', timestamp: '2025-01-15T10:10:00Z' }
            ]);

            const result = computeSkillsMetrics(invocations);

            expect(result.totalInvocations).toBe(3);
        });

        it('should extract unique skills in order of first occurrence', () => {
            const invocations = createMockInvocations([
                { skill: 'commit', timestamp: '2025-01-15T10:00:00Z' },
                { skill: 'review-pr', timestamp: '2025-01-15T10:05:00Z' },
                { skill: 'commit', timestamp: '2025-01-15T10:10:00Z' },
                { skill: 'test', timestamp: '2025-01-15T10:15:00Z' }
            ]);

            const result = computeSkillsMetrics(invocations);

            expect(result.uniqueSkills).toEqual(['commit', 'review-pr', 'test']);
        });

        it('should identify the most recent skill', () => {
            const invocations = createMockInvocations([
                { skill: 'commit', timestamp: '2025-01-15T10:00:00Z' },
                { skill: 'review-pr', timestamp: '2025-01-15T10:05:00Z' },
                { skill: 'test', timestamp: '2025-01-15T10:10:00Z' }
            ]);

            const result = computeSkillsMetrics(invocations);

            expect(result.lastSkill).toBe('test');
        });

        it('should sort invocations chronologically', () => {
            const invocations = createMockInvocations([
                { skill: 'test', timestamp: '2025-01-15T10:10:00Z' },
                { skill: 'commit', timestamp: '2025-01-15T10:00:00Z' },
                { skill: 'review-pr', timestamp: '2025-01-15T10:05:00Z' }
            ]);

            const result = computeSkillsMetrics(invocations);

            expect(result.invocations[0]?.skill).toBe('commit');
            expect(result.invocations[1]?.skill).toBe('review-pr');
            expect(result.invocations[2]?.skill).toBe('test');
        });

        it('should handle single invocation', () => {
            const invocations = createMockInvocations([
                { skill: 'commit', timestamp: '2025-01-15T10:00:00Z' }
            ]);

            const result = computeSkillsMetrics(invocations);

            expect(result.totalInvocations).toBe(1);
            expect(result.uniqueSkills).toEqual(['commit']);
            expect(result.lastSkill).toBe('commit');
        });

        it('should preserve args in invocations', () => {
            const invocations = createMockInvocations([
                { skill: 'commit', timestamp: '2025-01-15T10:00:00Z', args: '-m "feat: add feature"' }
            ]);

            const result = computeSkillsMetrics(invocations);

            expect(result.invocations[0]?.args).toBe('-m "feat: add feature"');
        });
    });
});
