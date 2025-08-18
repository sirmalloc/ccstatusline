import * as fs from 'fs';
import * as path from 'path';

// Get package version
// __PACKAGE_VERSION__ will be replaced at build time
const PACKAGE_VERSION = '__PACKAGE_VERSION__';

export function getPackageVersion(): string {
    // If we have the build-time replaced version, use it (check if it looks like a version)
    if (/^\d+\.\d+\.\d+/.test(PACKAGE_VERSION)) {
        return PACKAGE_VERSION;
    }

    // Fallback for development mode
    const possiblePaths = [
        path.join(__dirname, '..', '..', 'package.json'), // Development: dist/utils/ -> root
        path.join(__dirname, '..', 'package.json')       // Production: dist/ -> root (bundled)
    ];

    for (const packageJsonPath of possiblePaths) {
        try {
            if (fs.existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
                return packageJson.version ?? '';
            }
        } catch {
            // Continue to next path
        }
    }

    return '';
}

// Get terminal width
export function getTerminalWidth(): number | null {
    const width = process.stdout.columns;
    if (width) {
        return width;
    }

    return null;
}

// Check if terminal width detection is available
export function canDetectTerminalWidth(): boolean {
    return Boolean(process.stdout.columns);
}