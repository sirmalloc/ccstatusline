#!/usr/bin/env node
// Entry point. Kept deliberately tiny: static imports are parsed and compiled
// before any code in a module runs, so the compile cache has to be switched on
// here, before the real entry (./main) and its bundled chunks are loaded.
import { enableCompileCache } from './utils/compile-cache';

enableCompileCache();

import('./main').catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
