# CPU Usage Bug Report - ccstatusline

## Executive Summary
Users are reporting high CPU usage (up to 150%) when running ccstatusline via `npx`. The issue appears to be platform-specific, likely affecting Windows users more than Unix/macOS users. Multiple code paths lack proper timeout handling.

## Identified Issues

### 1. Git Commands Without Timeouts (MEDIUM PRIORITY - HANGING RISK)
**Locations**:
- `src/widgets/GitBranch.ts:33-36` - `execSync('git branch --show-current')`
- `src/widgets/GitChanges.ts` - `execSync('git diff --shortstat')` and `execSync('git diff --cached --shortstat')`

**Problems**:
- No timeout specified on execSync calls
- Can hang indefinitely if git prompts for credentials
- Repository corruption or network issues can cause hangs
- Git hooks that don't exit properly will block forever

### 3. Terminal Width Detection Without Timeouts (LOW PRIORITY - HANGING RISK)
**Location**: `src/utils/terminal.ts:39-82`

**Problems**:
- Multiple execSync calls without timeouts:
  - `ps -o tty= -p $(ps -o ppid= -p $$)`
  - `stty size < /dev/${tty}`
  - `tput cols`
- Can hang in non-standard environments

### 4. Powerline Font Operations Without Timeouts (LOW PRIORITY - HANGING RISK)
**Location**: `src/utils/powerline.ts`

**Problems**:
- `execSync('git clone...')` - Network operations without timeout
- `execSync('./install.sh')` - Script execution without timeout
- `execSync('fc-cache -f -v')` - System operations without timeout
- Can hang on network issues or interactive prompts

### 5. Platform-Specific stdin Behavior
**Root Cause Analysis**:
- **Windows**: Uses different process spawning mechanism, ConPTY vs Unix PTY
- **npx on Windows**: May create unnecessary stdin pipes
- **Node.js on Windows**: Historical issues with non-blocking stdin
- **Claude Code integration**: May handle stdio differently per platform

## Recommended Fixes

### Fix 1: Add Timeouts to Git Commands
```javascript
// GitBranch.ts
const branch = execSync('git branch --show-current', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
    timeout: 5000  // 5 second timeout
}).trim();

// GitChanges.ts
const unstagedStat = execSync('git diff --shortstat', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
    timeout: 5000  // 5 second timeout
}).trim();
```

### Fix 2: Add Timeouts to Terminal Detection
```javascript
// terminal.ts
const tty = execSync('ps -o tty= -p $(ps -o ppid= -p $$)', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
    shell: '/bin/sh',
    timeout: 1000  // 1 second timeout
}).trim();

const width = execSync(`stty size < /dev/${tty} | awk '{print $2}'`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
    shell: '/bin/sh',
    timeout: 1000  // 1 second timeout
}).trim();
```

### Fix 3: Add Fallback for Windows stdin Detection
```javascript
// Additional Windows-specific check
function isDataPiped(): boolean {
    if (process.platform === 'win32') {
        // On Windows, check if stdin is truly piped by examining the handle
        try {
            // Check if stdin.isTTY is false but no data is immediately available
            if (!process.stdin.isTTY && !process.stdin.readableLength) {
                // Set non-blocking and check if data arrives quickly
                process.stdin.setRawMode?.(false);
                return process.stdin.readableLength > 0;
            }
        } catch {
            // If any Windows-specific checks fail, assume no piped data
            return false;
        }
    }
    return !process.stdin.isTTY;
}
```

### Fix 4: Add Global Timeout Configuration
```javascript
// config.ts - Add to default settings
export const DEFAULT_EXEC_TIMEOUT = 5000; // 5 seconds

// Apply consistently across all execSync calls
const execOptions = {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
    timeout: DEFAULT_EXEC_TIMEOUT
};
```

## Testing Recommendations

### 1. Test stdin Detection
```bash
# Test with piped input
echo '{"model":{"display_name":"test"}}' | npx ccstatusline

# Test without piped input (should launch TUI)
npx ccstatusline

# Test on different platforms
# Windows: PowerShell, CMD, Git Bash
# macOS/Linux: bash, zsh, sh
```

### 2. Test Timeout Behavior
- Simulate slow git operations
- Test in repositories requiring authentication
- Test with broken terminal detection
- Test with slow network for font downloads

### 3. Platform-Specific Testing
- Windows 10/11 with different terminals
- WSL/WSL2 environments
- macOS with various shell configurations
- Linux distributions with different init systems

## Impact Analysis

### Performance Impact
- Adding timeouts will prevent indefinite hangs
- Minimal overhead for normal operations

### Compatibility Impact
- Maintains backward compatibility
- Works across all platforms with proper timeout handling

## Implementation Priority

1. **HIGH**: Add timeouts to git commands (Fix 1) - Prevents common hangs
2. **MEDIUM**: Add timeouts to terminal detection (Fix 2) - Improves reliability
3. **LOW**: Add Windows stdin detection fallback (Fix 3) - Platform-specific improvement
4. **LOW**: Add global timeout configuration (Fix 4) - Consistency improvement

## Conclusion

Multiple code paths in ccstatusline lack proper timeout handling, which can lead to indefinite hangs when external commands fail to respond. The recommended fixes add timeouts to git operations, terminal detection, and other system calls to improve reliability across all platforms.