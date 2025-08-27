#!/usr/bin/env bun

import { execSync } from 'child_process';

async function main() {
    const file = Bun.file(import.meta.dirname + '/payload.json');
    const payload: unknown = await file.json();

    const statusline = execSync('bun run src/ccstatusline.ts', { input: JSON.stringify(payload), stdio: 'pipe', encoding: 'utf-8', env: { ...process.env, CCSTATUSLINE_CONFIG: import.meta.dirname + '/settings.json' } });

    console.log(statusline);
}

void main();