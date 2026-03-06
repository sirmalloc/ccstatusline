import * as fs from 'fs';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const readFileSync = fs.readFileSync;

function splitJsonlContent(content: string): string[] {
    return content.trim().split('\n').filter(line => line.length > 0);
}

export async function readJsonlLines(filePath: string): Promise<string[]> {
    const content = await readFile(filePath, 'utf-8');
    return splitJsonlContent(content);
}

export function readJsonlLinesSync(filePath: string): string[] {
    const content = readFileSync(filePath, 'utf-8');
    return splitJsonlContent(content);
}

export function parseJsonlLine(line: string): unknown {
    try {
        return JSON.parse(line) as unknown;
    } catch {
        return null;
    }
}