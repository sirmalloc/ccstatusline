# Windows Support

`ccstatusline` works on Windows across PowerShell (5.1+ and 7+), Command Prompt, and Windows Subsystem for Linux (WSL).

If you want the main project overview, return to [README.md](../README.md).

## Installation on Windows

### Option 1: Using Bun (Recommended)

```powershell
# Install Bun for Windows
irm bun.sh/install.ps1 | iex

# Run ccstatusline
bunx -y ccstatusline@latest
```

### Option 2: Using Node.js

```powershell
# Using npm
npx -y ccstatusline@latest

# Or with Yarn
yarn dlx ccstatusline@latest

# Or with pnpm
pnpm dlx ccstatusline@latest
```

## Claude Code Integration

Configure `ccstatusline` in your Claude Code settings:

**Settings location:**
- Default: `%USERPROFILE%\.claude\settings.json`
- Custom: set `CLAUDE_CONFIG_DIR` to use a different directory

**PowerShell custom config example:**

```powershell
$env:CLAUDE_CONFIG_DIR="C:\custom\path\.claude"
```

**For Bun users:**

```json
{
  "statusLine": {
    "type": "command",
    "command": "bunx -y ccstatusline@latest",
    "padding": 0
  }
}
```

**For npm users:**

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y ccstatusline@latest",
    "padding": 0
  }
}
```

## Windows-Specific Features

### Powerline Font Support

For optimal Powerline rendering on Windows:

**Windows Terminal** (Recommended):
- Supports Powerline fonts natively
- Download from [Microsoft Store](https://aka.ms/terminal)
- Auto-detects compatible fonts

**PowerShell/Command Prompt**:

```powershell
# Install JetBrains Mono Nerd Font via winget
winget install DEVCOM.JetBrainsMonoNerdFont

# Or download manually from: https://www.nerdfonts.com/font-downloads

# Alternative: Download and install base JetBrains Mono font
# from [JetBrains](https://www.jetbrains.com/lp/mono/)
# or [GitHub](https://github.com/JetBrains/JetBrainsMono)
# or [Google Fonts](https://fonts.google.com/specimen/JetBrains+Mono)
```

### Path Handling

`ccstatusline` automatically handles Windows-specific paths:
- Git repositories work with both `/` and `\` path separators
- Current Working Directory widget displays Windows-style paths correctly
- Full support for mapped network drives and UNC paths
- Handles Windows drive letters (C:, D:, etc.)

## Windows Troubleshooting

### Common Issues & Solutions

**Issue**: Powerline symbols showing as question marks or boxes

```powershell
# Solution: Install a compatible Nerd Font
winget install DEVCOM.JetBrainsMonoNerdFont
# Then set the font in your terminal settings
```

**Issue**: Git commands not recognized

```powershell
# Check if Git is installed and in PATH
git --version

# If not found, install Git:
winget install Git.Git
# Or download from: https://git-scm.com/download/win
```

**Issue**: Permission errors during installation

```powershell
# Use non-global installation (recommended)
npx -y ccstatusline@latest

# Or run PowerShell as Administrator for global install
```

**Issue**: "Execution Policy" errors in PowerShell

```powershell
# Temporarily allow script execution
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Issue**: Windows Defender blocking execution

```powershell
# If Windows Defender flags the binary:
# 1. Open Windows Security
# 2. Go to "Virus & threat protection"
# 3. Add exclusion for the ccstatusline binary location
# Or use temporary bypass (not recommended for production):
Add-MpPreference -ExclusionPath "$env:USERPROFILE\.bun\bin"
```

## Windows Subsystem for Linux (WSL)

`ccstatusline` works well in WSL environments:

```bash
# Install in WSL Ubuntu/Debian
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bunx -y ccstatusline@latest
```

**WSL benefits:**
- Native Unix-style path handling
- Better font rendering in WSL terminals
- Seamless integration with Linux development workflows

## Windows Terminal Configuration

For the best experience, configure Windows Terminal with these recommended settings:

### Terminal Settings (`settings.json`)

```json
{
  "profiles": {
    "defaults": {
      "font": {
        "face": "JetBrainsMono Nerd Font",
        "size": 12
      },
      "colorScheme": "One Half Dark"
    }
  }
}
```

## Performance on Windows

`ccstatusline` includes Windows-specific runtime behavior:
- **UTF-8 piped output fix**: In piped mode, it attempts to set code page `65001` for reliable symbol rendering
- **Path compatibility**: Git and CWD widgets handle both `/` and `\` separators