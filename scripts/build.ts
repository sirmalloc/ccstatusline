import {
    chmod,
    copyFile,
    rm
} from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });

const result = await Bun.build({
    entrypoints: ['src/ccstatusline.ts'],
    outdir: 'dist',
    target: 'node',
    format: 'esm',
    splitting: true,
    naming: {
        entry: 'ccstatusline-app.js',
        chunk: '[name]-[hash].[ext]'
    }
});

if (!result.success) {
    throw new AggregateError(result.logs, 'Failed to build ccstatusline');
}

// Copy verbatim: bundling this launcher can introduce syntax that old Node
// versions cannot parse, preventing them from seeing the upgrade instructions.
await copyFile('scripts/launcher.js', 'dist/ccstatusline.js');
await chmod('dist/ccstatusline.js', 0o755);
