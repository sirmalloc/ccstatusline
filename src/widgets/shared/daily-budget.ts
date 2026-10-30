const DAY_MS = 24 * 60 * 60 * 1000;

function isWeekday(dateMs: number): boolean {
    const day = new Date(dateMs).getUTCDay();
    return day !== 0 && day !== 6;
}

// Days left in the extra usage month, for spreading what's left of the monthly
// limit across them. Monthly limits reset at 00:00 UTC on the 1st, so days are
// UTC days. Today always counts: it's the day being spent, even a weekend day
// when only weekdays are counted, which also keeps the result at least 1.
export function countBudgetDaysLeft(nowMs: number, weekdaysOnly: boolean): number {
    const now = new Date(nowMs);
    const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const nextMonthMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);

    let days = 1;
    for (let dayMs = todayMs + DAY_MS; dayMs < nextMonthMs; dayMs += DAY_MS) {
        if (!weekdaysOnly || isWeekday(dayMs)) {
            days += 1;
        }
    }
    return days;
}
