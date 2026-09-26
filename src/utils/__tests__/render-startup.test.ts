import type * as childProcess from 'child_process';
import * as fs from 'fs';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';
import {
    expect,
    it
} from 'vitest';

const require = createRequire(import.meta.url);
const { execFileSync } = require('node:child_process') as { execFileSync: typeof childProcess.execFileSync };

it('constructs the widget registry without initializing Ink/Yoga or fetching its WASM', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-startup-'));
    const widgetsUrl = new URL('../widgets.ts', import.meta.url).href;
    try {
        // A fresh process avoids module caches and the other tests' Ink imports.
        const output = execFileSync('bun', ['-e', `
            let fetches = 0;
            let wasm = 0;
            const originalFetch = globalThis.fetch;
            globalThis.fetch = (...args) => { fetches++; return originalFetch(...args); };
            const instantiate = WebAssembly.instantiate;
            WebAssembly.instantiate = (...args) => { wasm++; return instantiate(...args); };
            const streaming = WebAssembly.instantiateStreaming;
            WebAssembly.instantiateStreaming = (...args) => { wasm++; return streaming(...args); };
            const { getWidget } = await import(${JSON.stringify(widgetsUrl)});
            console.log(JSON.stringify({ fetches, wasm, model: getWidget('model')?.getDisplayName() }));
        `], {
            encoding: 'utf8',
            env: {
                PATH: process.env.PATH,
                HOME: home,
                USERPROFILE: home,
                CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
                HTTPS_PROXY: '',
                https_proxy: ''
            },
            timeout: 10000
        });
        expect(JSON.parse(output)).toEqual({ fetches: 0, wasm: 0, model: 'Model' });
    } finally {
        fs.rmSync(home, { recursive: true, force: true });
    }
});
