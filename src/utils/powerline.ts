import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { PowerlineFontStatus } from '../types/PowerlineFontStatus';

// Re-export for backward compatibility
export type { PowerlineFontStatus };

// Track if fonts were installed during this session (for DEBUG_FONT_INSTALL)
let fontsInstalledThisSession = false;

/**
 * Check if Powerline fonts are installed by testing if Powerline symbols render correctly
 */
export function checkPowerlineFonts(): PowerlineFontStatus {
    // Debug mode: pretend fonts aren't installed (unless we installed them this session)
    if (process.env.DEBUG_FONT_INSTALL === '1' && !fontsInstalledThisSession) {
        return {
            installed: false,
            checkedSymbol: '\uE0B0'
        };
    }

    try {
        // Test if we can display the common Powerline separator symbols
        // These are the key characters that require Powerline fonts
        const testSymbols = {
            rightArrow: '\uE0B0',     //
            rightThinArrow: '\uE0B1',  //
            leftArrow: '\uE0B2',       //
            leftThinArrow: '\uE0B3'   //
        };

        // Try to detect if fonts are available
        // This is a heuristic check - we assume if the system has common Powerline font files, they're available
        const platform = os.platform();
        let fontPaths: string[] = [];

        if (platform === 'darwin') {
            fontPaths = [
                path.join(os.homedir(), 'Library', 'Fonts'),
                '/Library/Fonts',
                '/System/Library/Fonts'
            ];
        } else if (platform === 'linux') {
            fontPaths = [
                path.join(os.homedir(), '.local', 'share', 'fonts'),
                path.join(os.homedir(), '.fonts'),
                '/usr/share/fonts',
                '/usr/local/share/fonts'
            ];
        } else if (platform === 'win32') {
            fontPaths = [
                path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Fonts'),
                'C:\\Windows\\Fonts'
            ];
        }

        // Common Powerline font patterns to look for
        const powerlineFontPatterns = [
            /powerline/i,
            /nerd font/i,
            /for powerline/i,
            /meslo.*lg/i,  // Meslo LG fonts often include Powerline
            /source.*code.*pro.*powerline/i,
            /dejavu.*powerline/i,
            /ubuntu.*mono.*powerline/i,
            /cascadia.*code.*pl/i,  // Cascadia Code PL
            /fira.*code.*nerd/i
        ];

        // Check if any Powerline fonts exist
        for (const fontPath of fontPaths) {
            if (fs.existsSync(fontPath)) {
                try {
                    const files = fs.readdirSync(fontPath);
                    for (const file of files) {
                        for (const pattern of powerlineFontPatterns) {
                            if (pattern.test(file)) {
                                return {
                                    installed: true,
                                    checkedSymbol: testSymbols.rightArrow
                                };
                            }
                        }
                    }
                } catch {
                    // Ignore read errors for specific directories
                }
            }
        }

        return {
            installed: false,
            checkedSymbol: testSymbols.rightArrow
        };
    } catch {
        return { installed: false };
    }
}

/**
 * Check if Powerline fonts are installed (async version with fc-list check)
 */
export async function checkPowerlineFontsAsync(): Promise<PowerlineFontStatus> {
    // Ensure this is always async
    await Promise.resolve();

    // Debug mode: pretend fonts aren't installed (unless we installed them this session)
    if (process.env.DEBUG_FONT_INSTALL === '1' && !fontsInstalledThisSession) {
        return {
            installed: false,
            checkedSymbol: '\uE0B0'
        };
    }

    try {
        // First do the quick synchronous check
        const quickCheck = checkPowerlineFonts();
        if (quickCheck.installed) {
            return quickCheck;
        }

        // Additional check: See if fontconfig knows about Powerline fonts (Linux/macOS)
        const platform = os.platform();
        if (platform === 'linux' || platform === 'darwin') {
            try {
                const { exec } = await import('child_process');
                const { promisify } = await import('util');
                const execAsync = promisify(exec);

                const { stdout } = await execAsync('fc-list 2>/dev/null | grep -i powerline', { encoding: 'utf8' });

                if (stdout.trim()) {
                    return {
                        installed: true,
                        checkedSymbol: '\uE0B0'
                    };
                }
            } catch {
                // fc-list not available or no Powerline fonts found
            }
        }

        return quickCheck;
    } catch {
        return { installed: false };
    }
}

/**
 * Install Powerline fonts on the system
 */
export async function installPowerlineFonts(): Promise<{ success: boolean; message: string }> {
    // Ensure this is always async
    await Promise.resolve();

    try {
        const platform = os.platform();
        let fontDir: string;

        // Determine font directory based on platform
        if (platform === 'darwin') {
            fontDir = path.join(os.homedir(), 'Library', 'Fonts');
        } else if (platform === 'linux') {
            fontDir = path.join(os.homedir(), '.local', 'share', 'fonts');
        } else if (platform === 'win32') {
            fontDir = path.join(
                os.homedir(),
                'AppData',
                'Local',
                'Microsoft',
                'Windows',
                'Fonts'
            );
        } else {
            return {
                success: false,
                message: 'Unsupported platform for font installation'
            };
        }

        // Create font directory if it doesn't exist
        if (!fs.existsSync(fontDir)) {
            fs.mkdirSync(fontDir, { recursive: true });
        }

        // Create temporary directory for font download
        const tempDir = path.join(os.tmpdir(), `ccstatusline-powerline-fonts-${Date.now()}`);

        try {
            // Clean up if temp directory exists
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }

            // Clone Powerline fonts repository
            execSync(
                `git clone --depth=1 https://github.com/powerline/fonts.git "${tempDir}"`,
                {
                    stdio: 'pipe',
                    encoding: 'utf8'
                }
            );

            // Run the install script based on platform
            if (platform === 'darwin' || platform === 'linux') {
                const installScript = path.join(tempDir, 'install.sh');

                if (fs.existsSync(installScript)) {
                    // Make script executable
                    fs.chmodSync(installScript, 0o755);

                    // Run install script
                    execSync(`cd "${tempDir}" && ./install.sh`, {
                        stdio: 'pipe',
                        encoding: 'utf8',
                        shell: '/bin/bash'
                    });

                    // On Linux, update font cache
                    if (platform === 'linux') {
                        try {
                            execSync('fc-cache -f -v', {
                                stdio: 'pipe',
                                encoding: 'utf8'
                            });
                        } catch {
                            // fc-cache might not be available
                        }
                    }

                    // Mark as installed for DEBUG_FONT_INSTALL mode
                    if (process.env.DEBUG_FONT_INSTALL === '1') {
                        fontsInstalledThisSession = true;
                    }

                    return {
                        success: true,
                        message: 'Powerline fonts installed successfully! Please restart your terminal and select a Powerline font (e.g., "Source Code Pro for Powerline", "Meslo LG S for Powerline", etc.)'
                    };
                } else {
                    throw new Error('Install script not found in Powerline fonts repository');
                }
            } else {
                // For Windows, we need to copy font files manually
                const fontFiles: string[] = [];

                // Find all font files in the repository
                function findFontFiles(dir: string): void {
                    const files = fs.readdirSync(dir);
                    for (const file of files) {
                        const filePath = path.join(dir, file);
                        const stat = fs.statSync(filePath);

                        if (stat.isDirectory() && !file.startsWith('.')) {
                            findFontFiles(filePath);
                        } else if (file.endsWith('.ttf') || file.endsWith('.otf')) {
                            // Only include fonts that have "Powerline" in their path
                            if (filePath.toLowerCase().includes('powerline')) {
                                fontFiles.push(filePath);
                            }
                        }
                    }
                }

                findFontFiles(tempDir);

                // Copy font files to Windows font directory
                let installedCount = 0;
                for (const fontFile of fontFiles) {
                    const fileName = path.basename(fontFile);
                    const destPath = path.join(fontDir, fileName);

                    try {
                        fs.copyFileSync(fontFile, destPath);
                        installedCount++;
                    } catch {
                        // Ignore individual file errors
                    }
                }

                if (installedCount > 0) {
                    return {
                        success: true,
                        message: `Installed ${installedCount} Powerline fonts. Please restart your terminal and select a Powerline font from your terminal settings.`
                    };
                } else {
                    throw new Error('No fonts were installed');
                }
            }

            return {
                success: false,
                message: 'Platform-specific installation not implemented'
            };
        } finally {
            // Clean up temporary directory
            if (fs.existsSync(tempDir)) {
                try {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                } catch {
                    // Ignore cleanup errors
                }
            }
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Provide helpful error messages
        if (errorMessage.includes('git')) {
            return {
                success: false,
                message: 'Git is required to install Powerline fonts. Please install Git and try again.'
            };
        }

        return {
            success: false,
            message: `Failed to install Powerline fonts: ${errorMessage}. You can manually install fonts from: https://github.com/powerline/fonts`
        };
    }
}

/**
 * Get a user-friendly message about Powerline font status
 */
export function getPowerlineStatusMessage(status: PowerlineFontStatus): string {
    if (status.installed) {
        return `✓ Powerline fonts detected`;
    } else {
        return `✗ Powerline fonts not detected - some symbols may not display correctly`;
    }
}