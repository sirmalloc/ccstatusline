import * as fs from 'fs';
import * as path from 'path';

import type {
    SkillInvocation,
    SkillsMetrics
} from '../types/SkillsMetrics';

import { getClaudeConfigDir } from './claude-settings';

const EMPTY: SkillsMetrics = { totalInvocations: 0, uniqueSkills: [], lastSkill: null };

export function getSkillsFilePath(sessionId: string): string {
    return path.join(getClaudeConfigDir(), 'ccstatusline', `skills-${sessionId}.jsonl`);
}

export function getSkillsMetrics(sessionId: string): SkillsMetrics {
    const filePath = getSkillsFilePath(sessionId);
    if (!fs.existsSync(filePath)) {
        return EMPTY;
    }

    try {
        const invocations: SkillInvocation[] = fs.readFileSync(filePath, 'utf-8')
            .trim().split('\n')
            .filter(line => line.trim())
            .map((line) => {
                try { return JSON.parse(line) as SkillInvocation; } catch {
                    return null;
                }
            })
            .filter((e): e is SkillInvocation => e !== null && typeof e.skill === 'string' && typeof e.session_id === 'string');
        if (invocations.length === 0) {
            return EMPTY;
        }
        return {
            totalInvocations: invocations.length,
            uniqueSkills: [...new Set(invocations.map(i => i.skill))],
            lastSkill: invocations.at(-1)?.skill ?? null
        };
    } catch {
        return EMPTY;
    }
}