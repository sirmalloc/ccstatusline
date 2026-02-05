export interface SkillInvocation {
    timestamp: string;
    session_id: string;
    skill: string;
    source: string;
}

export interface SkillsMetrics {
    totalInvocations: number;
    uniqueSkills: string[];
    lastSkill: string | null;
    invocations: SkillInvocation[];
}
