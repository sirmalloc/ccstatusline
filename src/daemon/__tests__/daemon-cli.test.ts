import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

// CLI behavior of a bare `ccstatusline daemon` (issue #51): it must print
// the usage line and exit non-zero instead of starting a foreground server.
// Run in-process (argv pinned, process.exit mocked) so the assertion covers
// the parsing branch without spawning a child.
describe('daemon CLI usage', () => {
    it('prints usage and exits non-zero on a bare `daemon`', async () => {
        const originalArgv = process.argv;
        process.argv = ['bun', 'ccstatusline', 'daemon'];
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
            throw new Error(`exit:${code ?? 0}`);
        });
        try {
            const { runDaemonCommand } = await import('../lifecycle');
            await expect(runDaemonCommand()).rejects.toThrow('exit:1');
            expect(errorSpy).toHaveBeenCalledTimes(1);
            expect(errorSpy).toHaveBeenCalledWith('usage: ccstatusline daemon [start|stop|status|restart|install|uninstall]');
        } finally {
            exitSpy.mockRestore();
            errorSpy.mockRestore();
            process.argv = originalArgv;
        }
    });
});
