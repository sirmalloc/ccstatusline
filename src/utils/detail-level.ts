export type DetailLevel = 'wide' | 'medium' | 'narrow';

export function getDetailLevel(terminalWidth: number | null | undefined): DetailLevel {
    const width = terminalWidth ?? 120;
    if (width >= 100)
        return 'wide';
    if (width >= 60)
        return 'medium';
    return 'narrow';
}