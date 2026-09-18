import { $ } from 'bun';
import {
    mkdtemp,
    readdir
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: bun run test:runtimes [image ...] [--output-dir logs-directory]');
    console.log('Builds and packs into a temporary directory, then runs the Docker checks.');
    console.log('With no images specified, runs the full Node.js 14–24 matrix.');
    process.exit(0);
}

const root = join(import.meta.dir, '..');
const artifacts = await mkdtemp(join(tmpdir(), 'ccstatusline-runtimes-'));
console.log(`Package artifacts: ${artifacts}`);

await $`${process.execPath} run build`.cwd(root);
await $`npm pack --pack-destination ${artifacts}`.cwd(root);

const tarball = (await readdir(artifacts)).find(name => name.endsWith('.tgz'));
if (!tarball) {
    throw new Error('npm pack did not create a tarball');
}

const result = await $`python3 ${join(root, 'scripts/test-package-runtimes.py')} ${join(artifacts, tarball)} --output-dir ${join(artifacts, 'logs')} ${args}`.cwd(root).nothrow();
process.exitCode = result.exitCode;
