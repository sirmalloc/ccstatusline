import * as fs from 'fs';
import * as path from 'path';

export const DEFAULT_EXPORT_FILE_NAME = 'ccstatusline-config.json';

// Matches the union layout of ImportValidationResult in config.ts (`= |` on the first member).
export type ExportTargetStatus
    = | 'ok'
        | 'exists'
        | 'missing-dir'
        | 'is-directory'
        | 'parent-not-directory'
        | 'not-regular';

export type ExportFileNameResult
    = | { ok: true; fileName: string }
        | { ok: false; error: string };

const MAX_FILE_NAME_LENGTH = 255;

/** Appends ".json" unless the name already ends with it (case-insensitive). */
export function withJsonExtension(name: string): string {
    return name.toLowerCase().endsWith('.json') ? name : `${name}.json`;
}

/** Validates the "File name:" field. Returns the final name (with .json) or an inline error. */
export function validateExportFileName(raw: string): ExportFileNameResult {
    const name = raw.trim();
    if (!name) {
        return { ok: false, error: 'File name cannot be empty' };
    }
    if (/[\\/]/u.test(name)) {
        return { ok: false, error: 'File name cannot contain / or \\ (press Ctrl+T to type a full path)' };
    }
    if (name === '.' || name === '..' || name.includes('\0')) {
        return { ok: false, error: 'Invalid file name' };
    }
    const fileName = withJsonExtension(name);
    // Filesystems limit bytes, not characters.
    if (Buffer.byteLength(fileName, 'utf8') > MAX_FILE_NAME_LENGTH) {
        return { ok: false, error: `File name is too long (max ${MAX_FILE_NAME_LENGTH} bytes)` };
    }
    return { ok: true, fileName };
}

/** Classifies an absolute export target. Never writes to disk. */
export function getExportTargetStatus(filePath: string): ExportTargetStatus {
    try {
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            return 'is-directory';
        }
        // FIFOs, sockets and devices: writing could block forever or clobber a device.
        return stats.isFile() ? 'exists' : 'not-regular';
    } catch {
        // Not stat-able (absent, or a dangling symlink): fall through.
    }
    try {
        // A dangling symlink would make writeFile silently create the link's target.
        if (fs.lstatSync(filePath).isSymbolicLink()) {
            return 'not-regular';
        }
    } catch {
        // Absent: fall through to the parent-directory check.
    }
    try {
        return fs.statSync(path.dirname(filePath)).isDirectory() ? 'ok' : 'parent-not-directory';
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOTDIR') {
            return 'parent-not-directory';
        }
        // Only a genuinely absent folder gets the "create it?" prompt; EACCES/ELOOP/etc. are
        // reported by the write itself.
        return code === 'ENOENT' ? 'missing-dir' : 'ok';
    }
}

/**
 * Message for the Yes/No confirm screen. Only valid for 'exists' and 'missing-dir'.
 * When the target is a symlink, names the real file that would be overwritten.
 */
export function getExportConfirmMessage(status: 'exists' | 'missing-dir', targetPath: string): string {
    if (status === 'exists') {
        let realTarget = targetPath;
        try {
            realTarget = fs.realpathSync(targetPath);
        } catch {
            // Keep the given path; the write will surface any error.
        }
        const linkNote = realTarget === targetPath ? '' : `\n(symlink to ${realTarget})`;
        return `File already exists:\n${targetPath}${linkNote}\n\nOverwrite it?`;
    }
    return `Folder does not exist:\n${path.dirname(targetPath)}\n\nCreate it and export?`;
}
