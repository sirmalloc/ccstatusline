/**
 * A single skill invocation entry from the JSONL log
 */
export interface SkillInvocation {
    timestamp: string;
    session_id: string;
    skill: string;
    args: string;
}

/**
 * Aggregated metrics about skill invocations in a session
 */
export interface SkillsMetrics {
    /** Total number of skill invocations */
    totalInvocations: number;
    /** List of unique skill names used */
    uniqueSkills: string[];
    /** Most recently invoked skill */
    lastSkill: string | null;
    /** All invocations in chronological order */
    invocations: SkillInvocation[];
}
