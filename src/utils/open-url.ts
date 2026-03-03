import { spawnSync } from 'child_process';
import * as os from 'os';

export interface OpenExternalUrlResult {
    success: boolean;
    error?: string;
}

function runOpenCommand(command: string, args: string[]): string | null {
    const result = spawnSync(command, args, {
        stdio: 'ignore',
        windowsHide: true
    });

    if (result.error) {
        return result.error.message;
    }

    if (result.status !== 0) {
        return `Command exited with status ${result.status}`;
    }

    if (result.signal) {
        return `Command terminated by signal ${result.signal}`;
    }

    return null;
}

export function openExternalUrl(url: string): OpenExternalUrlResult {
    let parsedUrl: URL;

    try {
        parsedUrl = new URL(url);
    } catch {
        return {
            success: false,
            error: 'Invalid URL'
        };
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return {
            success: false,
            error: 'Only http(s) URLs are supported'
        };
    }

    const platform = os.platform();

    if (platform === 'darwin') {
        const commandError = runOpenCommand('open', [url]);
        return commandError ? { success: false, error: commandError } : { success: true };
    }

    if (platform === 'win32') {
        const commandError = runOpenCommand('cmd', ['/c', 'start', '', url]);
        return commandError ? { success: false, error: commandError } : { success: true };
    }

    if (platform === 'linux') {
        const xdgError = runOpenCommand('xdg-open', [url]);
        if (!xdgError) {
            return { success: true };
        }

        const gioError = runOpenCommand('gio', ['open', url]);
        if (!gioError) {
            return { success: true };
        }

        return {
            success: false,
            error: `xdg-open failed: ${xdgError}; gio open failed: ${gioError}`
        };
    }

    return {
        success: false,
        error: `Unsupported platform: ${platform}`
    };
}