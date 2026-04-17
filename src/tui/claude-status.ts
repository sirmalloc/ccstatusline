import {
    getExistingStatusLine,
    getRefreshInterval
} from '../utils/claude-settings';

export interface ClaudeStatusLineState {
    existingStatusLine: string | null;
    refreshInterval: number | null;
}

export async function loadClaudeStatusLineState(): Promise<ClaudeStatusLineState> {
    const [
        existingStatusLine,
        refreshInterval
    ] = await Promise.all([
        getExistingStatusLine(),
        getRefreshInterval()
    ]);

    return {
        existingStatusLine,
        refreshInterval
    };
}