import * as fs from 'fs';
import * as path from 'path';

import type { SkillInvocation, SkillsMetrics } from '../types/SkillsMetrics';

import { getClaudeConfigDir } from './claude-settings';

/**
 * Gets the directory where skill invocation files are stored
 */
export function getSkillsDataDir(): string {
    return path.join(getClaudeConfigDir(), 'ccstatusline');
}

/**
 * Gets the path to the skills JSONL file for a specific session
 */
export function getSkillsFilePath(sessionId: string): string {
    return path.join(getSkillsDataDir(), `skills-${sessionId}.jsonl`);
}

/**
 * Reads and parses a skills JSONL file for a given session
 */
export function readSkillsFile(sessionId: string): SkillInvocation[] {
    const filePath = getSkillsFilePath(sessionId);

    if (!fs.existsSync(filePath)) {
        return [];
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        const invocations: SkillInvocation[] = [];

        for (const line of lines) {
            try {
                const entry = JSON.parse(line) as SkillInvocation;
                if (entry.skill && entry.session_id) {
                    invocations.push(entry);
                }
            } catch {
                // Skip invalid JSON lines
            }
        }

        return invocations;
    } catch {
        return [];
    }
}

/**
 * Computes aggregated metrics from skill invocations
 */
export function computeSkillsMetrics(invocations: SkillInvocation[]): SkillsMetrics {
    if (invocations.length === 0) {
        return {
            totalInvocations: 0,
            uniqueSkills: [],
            lastSkill: null,
            invocations: []
        };
    }

    // Sort by timestamp to get chronological order
    const sorted = [...invocations].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Get unique skills (preserve order of first occurrence)
    const seen = new Set<string>();
    const uniqueSkills: string[] = [];
    for (const inv of sorted) {
        if (!seen.has(inv.skill)) {
            seen.add(inv.skill);
            uniqueSkills.push(inv.skill);
        }
    }

    return {
        totalInvocations: sorted.length,
        uniqueSkills,
        lastSkill: sorted[sorted.length - 1]?.skill ?? null,
        invocations: sorted
    };
}

/**
 * Gets skills metrics for a specific session
 */
export function getSkillsMetrics(sessionId: string): SkillsMetrics {
    const invocations = readSkillsFile(sessionId);
    return computeSkillsMetrics(invocations);
}

/**
 * Async version of getSkillsMetrics for consistency with other utils
 */
export async function getSkillsMetricsAsync(sessionId: string): Promise<SkillsMetrics> {
    return getSkillsMetrics(sessionId);
}
