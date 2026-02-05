import * as fs from 'fs';
import * as path from 'path';
import type { SkillInvocation, SkillsMetrics } from '../types/SkillsMetrics';
import { getClaudeConfigDir } from './claude-settings';

const emptyMetrics: SkillsMetrics = { totalInvocations: 0, uniqueSkills: [], lastSkill: null, invocations: [] };

export function getSkillsFilePath(sessionId: string): string {
    return path.join(getClaudeConfigDir(), 'ccstatusline', `skills-${sessionId}.jsonl`);
}

export function computeSkillsMetrics(invocations: SkillInvocation[]): SkillsMetrics {
    if (invocations.length === 0) return emptyMetrics;
    const sorted = [...invocations].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return {
        totalInvocations: sorted.length,
        uniqueSkills: [...new Set(sorted.map(i => i.skill))],
        lastSkill: sorted.at(-1)?.skill ?? null,
        invocations: sorted
    };
}

export function getSkillsMetrics(sessionId: string): SkillsMetrics {
    const filePath = getSkillsFilePath(sessionId);
    if (!fs.existsSync(filePath)) return emptyMetrics;

    try {
        const invocations = fs.readFileSync(filePath, 'utf-8')
            .trim().split('\n')
            .filter(line => line.trim())
            .map(line => { try { return JSON.parse(line); } catch { return null; } })
            .filter((e): e is SkillInvocation => e?.skill && e?.session_id);
        return computeSkillsMetrics(invocations);
    } catch {
        return emptyMetrics;
    }
}
