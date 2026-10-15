import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Mutation runs execute the whole suite against mutated code, and a mutant
// can turn an "isolated" test into one that reads or writes the real user
// home: a config parse that now fails materialises defaults, an install
// that now succeeds writes settings. Redirect the home directories once per
// run — every worker and test file inherits this environment, so no mutant
// can reach real files.
export default function setup(): () => void {
    const sandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-mutation-home-'));
    process.env.HOME = sandboxHome;
    process.env.CLAUDE_CONFIG_DIR = path.join(sandboxHome, '.claude');
    process.env.GIT_CONFIG_GLOBAL = '/dev/null';
    process.env.GIT_CONFIG_SYSTEM = '/dev/null';
    return (): void => {
        fs.rmSync(sandboxHome, { recursive: true, force: true });
    };
}
