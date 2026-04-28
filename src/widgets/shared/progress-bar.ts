export interface TimerProgressBarOptions { cursorPercent?: number }

export function makeTimerProgressBar(
    percent: number,
    width: number,
    options?: TimerProgressBarOptions
): string {
    const clampedPercent = Math.max(0, Math.min(100, percent));
    const filledWidth = Math.round((clampedPercent / 100) * width);

    const cursorPos = options?.cursorPercent !== undefined
        ? Math.min(Math.floor((Math.max(0, Math.min(100, options.cursorPercent)) / 100) * width), width - 1)
        : -1;

    let bar = '';
    for (let i = 0; i < width; i++) {
        if (i === cursorPos) {
            bar += '│';
        } else if (i < filledWidth) {
            bar += '█';
        } else {
            bar += '░';
        }
    }

    return bar;
}
