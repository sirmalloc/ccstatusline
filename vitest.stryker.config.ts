import { defineConfig } from 'vitest/config';

// Test profile for Stryker mutation runs. The standard suite minus the test
// files that mock Node builtins through `vi.spyOn(<builtin>, fn)` — bun's
// module namespaces are mutable so those spies work under `bun test` (the CI
// runner), but real vitest rejects them ("Module namespace is not configurable
// in ESM"). Everything excluded here still runs green in `bun test`; only the
// mutation scope is narrowed. Regular runs use vitest.config.ts.
export default defineConfig({
    test: {
        globalSetup: ['./vitest.stryker.global-setup.ts'],
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        exclude: [
            '**/node_modules/**',
            'src/__tests__/cli-smoke.test.ts',
            'src/utils/__tests__/git-hardening-exec.test.ts',
            'src/daemon/__tests__/client.test.ts',
            'src/daemon/__tests__/lifecycle.test.ts',
            'src/daemon/__tests__/server-dedup.test.ts',
            'src/widgets/__tests__/ClaudeAccountEmail.test.ts',
            'src/widgets/__tests__/CurrentWorkingDir.test.ts',
            'src/widgets/__tests__/CustomCommand.test.ts',
            'src/widgets/__tests__/FreeMemory.test.ts',
            'src/widgets/__tests__/GitAheadBehind.test.ts',
            'src/widgets/__tests__/GitBranch.test.ts',
            'src/widgets/__tests__/GitChanges.test.ts',
            'src/widgets/__tests__/GitCleanStatus.test.ts',
            'src/widgets/__tests__/GitConflicts.test.ts',
            'src/widgets/__tests__/GitCountWidgets.test.ts',
            'src/widgets/__tests__/GitDeletions.test.ts',
            'src/widgets/__tests__/GitInsertions.test.ts',
            'src/widgets/__tests__/GitIsFork.test.ts',
            'src/widgets/__tests__/GitRemoteWidgets.test.ts',
            'src/widgets/__tests__/GitRootDir.test.ts',
            'src/widgets/__tests__/GitStagedFiles.test.ts',
            'src/widgets/__tests__/GitStatusWidgets.test.ts',
            'src/widgets/__tests__/GitUnstagedFiles.test.ts',
            'src/widgets/__tests__/GitUntrackedFiles.test.ts',
            'src/widgets/__tests__/GitWorktree.test.ts',
            'src/widgets/__tests__/JjBookmarks.test.ts',
            'src/widgets/__tests__/JjChanges.test.ts',
            'src/widgets/__tests__/JjDeletions.test.ts',
            'src/widgets/__tests__/JjDescription.test.ts',
            'src/widgets/__tests__/JjInsertions.test.ts',
            'src/widgets/__tests__/JjRevision.test.ts',
            'src/widgets/__tests__/JjRootDir.test.ts',
            'src/widgets/__tests__/JjWidgetSharedBehavior.test.ts',
            'src/widgets/__tests__/JjWorkspace.test.ts',
            'src/utils/__tests__/claude-settings.test.ts',
            'src/utils/__tests__/custom-command.test.ts',
            'src/utils/__tests__/git-remote.test.ts',
            'src/utils/__tests__/git.test.ts',
            'src/utils/__tests__/global-command-resolution.test.ts',
            'src/utils/__tests__/global-package-manager.test.ts',
            'src/utils/__tests__/hook-handler.test.ts',
            'src/utils/__tests__/jj.test.ts',
            'src/utils/__tests__/jsonl-lines.test.ts',
            'src/utils/__tests__/open-url.test.ts',
            'src/utils/__tests__/powerline-install.test.ts',
            'src/utils/__tests__/skills.test.ts',
            'src/utils/__tests__/update-checker.test.ts',
            'src/utils/__tests__/usage-fetch.test.ts',
            'src/utils/__tests__/usage-identity.test.ts',
            'src/utils/__tests__/usage-token-buffer.test.ts',
            'src/utils/__tests__/usage-token.test.ts'
        ]
    }
});
