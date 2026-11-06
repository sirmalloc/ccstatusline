import * as fs from 'node:fs';

/**
 * Writes a file by replacing it: the data goes to a temp file next to it,
 * which is then renamed over it. Renaming needs only a folder this account
 * can write to, so a file left read-only or owned by another account (as a
 * run under sudo leaves one it created) is replaced all the same, and a
 * reader never sees a half-written file from a single writer. When the
 * rename can't be done, the file is written in place, as it would be
 * without one, which still works for a writable file in a folder that
 * isn't. Throws when neither works.
 */
export function replaceFileSync(filePath: string, data: string): void {
    // Stable temp name, as in git.ts writePersistentCache: a held handle (e.g.
    // a Windows virus scanner or sync client) can make the rename and the
    // cleanup unlink both fail, and a name unique to the process would then
    // leave one more orphan on every render. Two processes writing at once
    // can tear the shared temp file, as they could the file itself when
    // writing it in place.
    const tempPath = `${filePath}.tmp`;
    try {
        fs.writeFileSync(tempPath, data);
        fs.renameSync(tempPath, filePath);
        return;
    } catch {
        try {
            fs.unlinkSync(tempPath);
        } catch { /* best-effort cleanup; ignore */ }
    }

    fs.writeFileSync(filePath, data);
}
