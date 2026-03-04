import { spawnSync } from 'child_process';
import * as os from 'os';

export interface OpenExternalUrlResult {
    success: boolean;
    error?: string;
}

interface OpenCommandPlan {
    command: string;
    args: (url: string) => string[];
    errorPrefix?: string;
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

const PLATFORM_OPEN_PLANS: Record<string, OpenCommandPlan[]> = {
    darwin: [
        {
            command: 'open',
            args: url => [url]
        }
    ],
    win32: [
        {
            command: 'cmd',
            args: url => ['/c', 'start', '', url]
        }
    ],
    linux: [
        {
            command: 'xdg-open',
            args: url => [url],
            errorPrefix: 'xdg-open failed: '
        },
        {
            command: 'gio',
            args: url => ['open', url],
            errorPrefix: 'gio open failed: '
        }
    ]
};

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
    const plans = PLATFORM_OPEN_PLANS[platform];
    if (!plans) {
        return {
            success: false,
            error: `Unsupported platform: ${platform}`
        };
    }

    const errors: string[] = [];
    for (const plan of plans) {
        const commandError = runOpenCommand(plan.command, plan.args(url));
        if (!commandError) {
            return { success: true };
        }

        if (plan.errorPrefix) {
            errors.push(`${plan.errorPrefix}${commandError}`);
        } else {
            errors.push(commandError);
        }
    }

    return {
        success: false,
        error: errors.join('; ')
    };
}