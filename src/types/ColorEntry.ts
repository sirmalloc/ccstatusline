import type { ChalkInstance } from 'chalk';

export interface ColorEntry {
    name: string;
    displayName: string;
    isBackground: boolean;
    ansi16: ChalkInstance;
    ansi256: ChalkInstance;
    truecolor: ChalkInstance;
}