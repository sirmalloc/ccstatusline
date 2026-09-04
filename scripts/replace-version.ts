#!/usr/bin/env bun

import {
    readFileSync,
    readdirSync,
    writeFileSync
} from 'fs';
import { join } from 'path';

interface PackageJson {
    version: string;
    [key: string]: unknown;
}

// Read package.json to get version
const packageJson = JSON.parse(readFileSync('package.json', 'utf-8')) as PackageJson;
const version = packageJson.version;

// The build emits the entry plus code-split chunks, and the placeholder can
// land in any of them, so patch every emitted script rather than just the entry.
let patched = 0;
for (const file of readdirSync('dist')) {
    if (!file.endsWith('.js')) {
        continue;
    }
    const path = join('dist', file);
    const content = readFileSync(path, 'utf-8');
    if (!content.includes('__PACKAGE_VERSION__')) {
        continue;
    }
    writeFileSync(path, content.replace(/__PACKAGE_VERSION__/g, version));
    patched++;
}

if (patched === 0) {
    console.error('✗ No __PACKAGE_VERSION__ placeholder found in dist/');
    process.exit(1);
}

console.log(`✓ Replaced version placeholder with ${version} in ${patched} file(s)`);
