# Contributing

Contributions are welcome! This guide collects the existing contributor guidance
from [README.md](README.md), [AGENTS.md](AGENTS.md), and the
[development guide](docs/DEVELOPMENT.md).

## Set up your checkout

You need Git and [Bun](https://bun.sh) v1.0+. Node.js 14+ is optional for running
the built distribution.

1. Fork the repository and clone your fork.
2. Create a feature branch, for example `git checkout -b feature/amazing-feature`.
3. Install dependencies with `bun install`.

Use Bun for development: `bun <file>`, `bun install`, and `bun run <script>`.

## Check your changes

Run the tests and lint checks before opening a pull request:

```bash
bun test
bun run lint
```

`bun run lint` runs TypeScript checking and ESLint without modifying files. Use
`bun run lint:fix` only when you intend to apply ESLint fixes. Do not invoke
`eslint`, `tsc`, `tsx`, or variants such as `npx eslint` or `bun tsc` directly.
Never disable a lint rule with a comment.

For manual verification:

- For renderer changes, use `bun run example` to exercise piped-JSON mode. See
  [AGENTS.md](AGENTS.md#development-commands) for a custom payload example.
- For UI changes, run `bun run start` and check the interactive TUI.
- To check the distribution build, run `bun run build`.

Tests use Vitest via Bun and live in `__tests__/` directories alongside the code
they cover. Add tests for new widgets and features in `src/widgets/__tests__/`
or `src/utils/__tests__/`, as appropriate.

Usage-fetch subprocess probes must explicitly set `HOME`, `USERPROFILE`,
`CLAUDE_CONFIG_DIR`, and proxy variables. Keep these probes sandboxed so they
cannot read or write your live ccstatusline usage cache.

## Preserve compatibility and settings behavior

- Keep both Bun and Node.js runtimes working. The built `dist/` files must remain
  compatible with Node.js 14+. The build uses code splitting, so the distribution
  needs the complete `dist/` directory.
- Keep React and React DOM pinned to exact versions. Update `package.json` and
  `bun.lock` together when refreshing dependencies.
- Preserve the `ink@6.2.0` patch in `patches/ink@6.2.0.patch` and its
  `patchedDependencies` entry. Bun applies it during installation to fix macOS
  backspace handling (`\x7f` was interpreted as Delete). Account for this fix when
  upgrading Ink.
- Keep settings saves atomic and write through the resolved target of a
  symlinked `settings.json`, preserving its permissions.
- Do not overwrite invalid or unreadable settings during load. Preserve the
  warning and overwrite-confirmation flow for recovery in the TUI. Claude Code
  settings installation must stop if the existing file cannot be read or parsed.

See the [development guide](docs/DEVELOPMENT.md) for architecture, configuration
behavior, build details, and API documentation.

## Open a pull request

Commit your changes, push your feature branch to your fork, and open a pull
request against this repository.
