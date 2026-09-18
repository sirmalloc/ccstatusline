# Upgrade Node.js for ccstatusline

The ccstatusline renderer and configuration TUI require **Node.js 22.0.0 or newer**, or Bun. Node.js 24 LTS is recommended when upgrading.

If the status line says `ccstatusline requires Node.js 22+`, the runtime launching ccstatusline is too old. The launcher works on Node.js 14–21 so it can show this guide instead of a syntax error. In those versions, the upgrade notice replaces your configured widgets and interactive startup prints instructions instead of opening the TUI. Your settings are not changed or deleted.

## Upgrade with nvm (macOS, Linux, or WSL)

In a terminal where nvm is available:

```bash
nvm install 24
nvm use 24
node --version
```

The version should start with `v24.`. To make it the default for new shells as well, optionally run:

```bash
nvm alias default 24
```

Exit Claude Code and launch it again from this updated terminal. Changing Node in another terminal does not update an already-running Claude process. A project `.nvmrc` or shell startup configuration can select an older version again; check `node --version` in the project directory before restarting Claude.

## Other Node installations, including Windows

Install a current LTS release from [nodejs.org](https://nodejs.org/en/download), or update Node with the version manager you already use. On native Windows, use the Windows installer or your Windows version manager; the nvm shell commands above are for macOS, Linux, and WSL.

Open a new terminal, check `node --version`, then restart Claude Code from it. If the old version still appears, check which executable your shell finds:

```bash
# macOS / Linux / WSL
command -v node
```

```powershell
# Windows PowerShell
Get-Command node -All
```

If you launch Claude from an editor or desktop application, restart that application too so it picks up the new environment.

## Keep your existing ccstatusline configuration

There is no configuration migration for this runtime change. Keep `~/.config/ccstatusline/settings.json`, or the file selected by `--config`.

For an `npx -y ccstatusline@latest` status-line command, restarting Claude with the new Node runtime is normally sufficient. With nvm, global packages belong to a particular Node installation. If your status-line command is `ccstatusline` and that command is missing after switching Node versions, launch the configuration tool again:

```bash
npx -y ccstatusline@latest
```

Choose the pinned global installation flow to install ccstatusline for the new runtime. If you intentionally stay on a specific ccstatusline release, launch that version instead of `@latest`. For a self-managed command containing an absolute path to an old Node executable, update that path to the new runtime.

## Run with Bun instead

If Bun is installed, explicitly select its runtime:

```bash
bunx --bun -y ccstatusline@latest
```

The `--bun` flag matters when an older Node is still on `PATH`: it makes Bun run the CLI despite the `node` shebang. To use this for status-line rendering too, change only the `command` in your Claude Code `statusLine` settings, preserving other fields and any existing `--config` argument:

```json
{
  "type": "command",
  "command": "bunx --bun -y ccstatusline@latest"
}
```

Claude settings normally live in `~/.claude/settings.json`, or in the directory selected by `CLAUDE_CONFIG_DIR`.

## If npm refuses to install

An engine warning reflects the application requirement of Node.js 22+. npm normally permits installation and the launcher then shows this guide on older Node versions. With `engine-strict` enabled, npm can reject installation before the launcher runs. Upgrade Node first in that case.

The packaged `ccstatusline --version` command still reports the package version on Node.js 14–21; it does not mean the renderer or TUI supports that runtime. Run `node --version` to check Node itself.
