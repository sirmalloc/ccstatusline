# Walk ancestors looking for claude.exe, attach to its console, emit width.
# Emits nothing if claude.exe isn't in the chain — caller falls back to null.

$ErrorActionPreference = 'SilentlyContinue'

# @'...'@ is a literal here-string — PowerShell won't interpolate $ inside.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class NP {
    // Structs matching Win32 memory layout.
    [StructLayout(LayoutKind.Sequential)] public struct COORD { public short X; public short Y; }
    [StructLayout(LayoutKind.Sequential)] public struct SMALL_RECT { public short Left; public short Top; public short Right; public short Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    public struct CONSOLE_SCREEN_BUFFER_INFO {
        public COORD dwSize; public COORD dwCursorPosition; public short wAttributes;
        public SMALL_RECT srWindow; public COORD dwMaximumWindowSize;
    }

    // Win32 imports from kernel32.dll.
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AttachConsole(uint dwProcessId);
    [DllImport("kernel32.dll")] public static extern bool FreeConsole();
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern IntPtr CreateFile(string lpFileName, uint dwDesiredAccess, uint dwShareMode, IntPtr lpSecurityAttributes, uint dwCreationDisposition, uint dwFlagsAndAttributes, IntPtr hTemplateFile);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetConsoleScreenBufferInfo(IntPtr hConsoleOutput, out CONSOLE_SCREEN_BUFFER_INFO lpConsoleScreenBufferInfo);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr hObject);

    // Attach to pid's console, open CONOUT$ (active console output buffer — works even when our stdout is piped), 
    //read dwSize.X (matches Node's process.stdout.columns, which is what Claude Code's TUI uses).
    public static int ReadAttachedWidth(uint pid) {
        FreeConsole();
        if (!AttachConsole(pid)) return 0;
        IntPtr h = CreateFile("CONOUT$", 0x80000000u, 3u, IntPtr.Zero, 3u, 0u, IntPtr.Zero);
        int width = 0;
        if (h.ToInt64() != -1) {
            CONSOLE_SCREEN_BUFFER_INFO info;
            if (GetConsoleScreenBufferInfo(h, out info)) width = info.dwSize.X;
            CloseHandle(h);
        }
        FreeConsole();
        return width;
    }
}
'@

# pid -> @{Ppid, Name}. One CIM query pays WMI cold-start once.
$procs = @{}
Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,Name | ForEach-Object {
    $procs[[uint32]$_.ProcessId] = @{ Ppid = [uint32]$_.ParentProcessId; Name = $_.Name }
}

# Skip $PID itself (i=0) — AttachConsole to self = ERROR_ACCESS_DENIED.
# Walk up to 12 levels looking for claude.exe by name, then read its width.
# Intermediate shims (node.exe, bash.exe) sit in narrower ConPTYs, so their
# widths would be wrong.
$cur = [uint32]$PID
for ($i = 0; $i -lt 12; $i++) {
    if (-not $procs.ContainsKey($cur)) { break }
    if ($i -gt 0) {
        $name = $procs[$cur].Name
        if ($name -and $name.ToLowerInvariant() -eq 'claude.exe') {
            $w = [NP]::ReadAttachedWidth($cur)
            if ($w -gt 0) { Write-Output $w }
            break
        }
    }
    $cur = $procs[$cur].Ppid
    if ($cur -eq 0) { break }
}
