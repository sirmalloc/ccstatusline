import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    ensureRuntimeDir,
    getDiscoveryPath,
    getRuntimeDir,
    getSocketPath,
    prepareSocketPath,
    sweepStaleSockets
} from '../paths';

// Socket hygiene is POSIX-only by design; the transport refuses to run on Windows.

let runtimeDir = '';

// bun test runs every file in one process, so env mutations must be restored:
// a leaked TMPDIR (e.g. the macOS-style '/private/tmp/' set below) breaks
// mkdtemp for every later test on Linux.
const savedEnv: Record<string, string | undefined> = {};

// Same unset semantics as the server's env swap; keeps the dynamic-delete
// lint rule intact.
function unsetEnv(name: string): void {
    Reflect.deleteProperty(process.env, name);
}

beforeEach(() => {
    runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsd-paths-'));
    for (const name of ['CCSTATUSLINE_RUNTIME_DIR', 'XDG_RUNTIME_DIR', 'TMPDIR']) {
        savedEnv[name] = process.env[name];
        unsetEnv(name);
    }
});

afterEach(() => {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
    for (const [name, value] of Object.entries(savedEnv)) {
        if (value === undefined) {
            unsetEnv(name);
        } else {
            process.env[name] = value;
        }
    }
});

describe('getRuntimeDir', () => {
    it('prefers the explicit override, then XDG_RUNTIME_DIR, then TMPDIR + uid', () => {
        process.env.CCSTATUSLINE_RUNTIME_DIR = '/opt/ccs-override';
        expect(getRuntimeDir()).toBe('/opt/ccs-override');

        delete process.env.CCSTATUSLINE_RUNTIME_DIR;
        process.env.XDG_RUNTIME_DIR = '/run/user/1000';
        expect(getRuntimeDir()).toBe('/run/user/1000/ccstatusline');

        delete process.env.XDG_RUNTIME_DIR;
        process.env.TMPDIR = '/private/tmp/';
        expect(getRuntimeDir()).toBe(`/private/tmp/ccstatusline-${process.getuid?.() ?? 0}`);
    });
});

describe('ensureRuntimeDir', () => {
    it('creates the directory with mode 0700 and stays idempotent', () => {
        const dir = path.join(runtimeDir, 'nested', 'runtime');

        ensureRuntimeDir(dir);
        const stats = fs.statSync(dir);
        expect(stats.mode & 0o777).toBe(0o700);

        ensureRuntimeDir(dir);
        expect((fs.statSync(dir).mode & 0o777)).toBe(0o700);
    });

    it('tightens an existing directory that is too permissive', () => {
        fs.chmodSync(runtimeDir, 0o755);

        ensureRuntimeDir(runtimeDir);

        expect((fs.statSync(runtimeDir).mode & 0o777)).toBe(0o700);
    });

    it('refuses a non-directory at the runtime path', () => {
        const filePath = path.join(runtimeDir, 'afile');
        fs.writeFileSync(filePath, 'x');

        expect(() => { ensureRuntimeDir(filePath); }).toThrow('not a directory');
    });
});

describe('prepareSocketPath', () => {
    it('accepts a fresh path', () => {
        prepareSocketPath(getSocketPath(runtimeDir));
        expect(fs.existsSync(getSocketPath(runtimeDir))).toBe(false);
    });

    it('removes a stale socket file owned by this user so the daemon can relisten', async () => {
        const socketPath = getSocketPath(runtimeDir);
        const server = net.createServer();
        await new Promise<void>(resolve => server.listen({ path: socketPath }, resolve));
        expect(fs.lstatSync(socketPath).isSocket()).toBe(true);

        prepareSocketPath(socketPath);

        expect(fs.existsSync(socketPath)).toBe(false);
        await new Promise<void>(resolve => server.close(() => { resolve(); }));
    });

    it('refuses a regular file at the socket path and leaves it alone', () => {
        const socketPath = getSocketPath(runtimeDir);
        fs.writeFileSync(socketPath, 'not a socket');

        expect(() => { prepareSocketPath(socketPath); }).toThrow('non-socket');
        expect(fs.readFileSync(socketPath, 'utf8')).toBe('not a socket');
    });

    it('refuses a symlink at the socket path without following it', () => {
        const socketPath = getSocketPath(runtimeDir);
        const target = path.join(runtimeDir, 'target-file');
        fs.writeFileSync(target, 'payload');
        fs.symlinkSync(target, socketPath);

        expect(() => { prepareSocketPath(socketPath); }).toThrow('symlink');
        expect(fs.lstatSync(socketPath).isSymbolicLink()).toBe(true);
        expect(fs.readFileSync(target, 'utf8')).toBe('payload');
    });

    it('rejects a socket path that exceeds the Unix socket length limit', () => {
        const longPath = path.join(runtimeDir, 'd'.repeat(120));

        expect(() => { prepareSocketPath(longPath); }).toThrow('103 bytes');
    });

    it('exposes discovery and pid-suffixed socket paths inside the runtime dir', () => {
        expect(getSocketPath(runtimeDir)).toBe(path.join(runtimeDir, `daemon-${process.pid}.sock`));
        expect(getSocketPath(runtimeDir, 4242)).toBe(path.join(runtimeDir, 'daemon-4242.sock'));
        expect(getDiscoveryPath(runtimeDir)).toBe(path.join(runtimeDir, 'daemon.env'));
    });

    it('sweeps sockets of dead daemon pids and keeps live ones', async () => {
        // Find a pid that no longer exists (same ESRCH check the sweep uses).
        let deadPid = 0;
        for (let candidate = process.pid - 1; candidate > 1; candidate--) {
            try {
                process.kill(candidate, 0);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
                    deadPid = candidate;
                    break;
                }
            }
        }
        expect(deadPid).toBeGreaterThan(1);

        const deadPath = getSocketPath(runtimeDir, deadPid);
        const livePath = getSocketPath(runtimeDir);
        const deadServer = net.createServer();
        const liveServer = net.createServer();
        await new Promise<void>(resolve => deadServer.listen({ path: deadPath }, resolve));
        await new Promise<void>(resolve => liveServer.listen({ path: livePath }, resolve));

        sweepStaleSockets(runtimeDir);

        expect(fs.existsSync(deadPath)).toBe(false);
        expect(fs.existsSync(livePath)).toBe(true);

        await new Promise<void>(resolve => liveServer.close(() => { resolve(); }));
    });
});
