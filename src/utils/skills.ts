import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type {
    SkillInvocation,
    SkillsMetrics
} from '../types/SkillsMetrics';

const RECENT_CAP = 20;
const EMPTY: SkillsMetrics = { totalInvocations: 0, uniqueSkills: [], lastSkill: null, recent: [] };

function getSkillsDir(): string {
    return path.join(os.homedir(), '.cache', 'ccstatusline', 'skills');
}

export function getSkillsFilePath(sessionId: string): string {
    return path.join(getSkillsDir(), `skills-${sessionId}.jsonl`);
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

        const uniqueSkills: string[] = [];
        const seenSkills = new Set<string>();
        for (let i = invocations.length - 1; i >= 0; i--) {
            const skill = invocations[i]?.skill;
            if (skill && !seenSkills.has(skill)) {
                seenSkills.add(skill);
                uniqueSkills.push(skill);
            }
        }

        const recent = invocations
            .slice(-RECENT_CAP)
            .map(inv => inv.skill);

        return {
            totalInvocations: invocations.length,
            uniqueSkills,
            lastSkill: invocations[invocations.length - 1]?.skill ?? null,
            recent
        };
    } catch {
        return EMPTY;
    }
}