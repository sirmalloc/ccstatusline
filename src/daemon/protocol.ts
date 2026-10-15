import * as crypto from 'node:crypto';

// Daemon IPC protocol v1 (#16): the wire contract between the shell/curl
// client and the shared-background-renderer daemon. Everything a request
// carries beyond the status JSON itself lives here: the auth token, the
// bounded invocation-context header, and the size limits the server enforces
// before doing any work.

export const PROTOCOL_VERSION = 1;

/** Custom header carrying the base64-encoded invocation context. */
export const CONTEXT_HEADER = 'x-ccstatusline-context';

export const AUTH_SCHEME = 'bearer';

/**
 * Environment variables the render path actually reads from process.env.
 * The client snapshots exactly these names; the server rejects anything
 * else, so an arbitrary environment can never cross the IPC boundary (a
 * child process spawned by a widget inherits the daemon env plus this
 * slice, never the caller's whole environ). The shell client mirrors this
 * list — client/ccstatusline-ipc — keep the two in sync.
 */
export const ENV_ALLOWLIST = [
    'CLAUDE_CONFIG_DIR',
    'CLAUDE_SECURESTORAGE_CONFIG_DIR',
    'CCSTATUSLINE_CONTEXT_SIZE_FALLBACK',
    'CCSTATUSLINE_WIDTH',
    'COLUMNS',
    'HTTPS_PROXY',
    'NO_PROXY'
] as const;

/** Hard cap for the encoded context header (matches Node's default header limit). */
export const MAX_CONTEXT_BYTES = 16384;

/** Hard cap for the render request body. A status payload is a few KiB. */
export const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Requests served concurrently (one render at a time inside the process;
 * the rest wait in this bounded queue). Beyond the limit the server
 * answers 503 busy instead of growing an unbounded backlog.
 */
export const MAX_IN_FLIGHT_RENDERS = 4;

/** Per-request working-directory entry inside the context payload. */
const CWD_KEY = 'cwd';

export interface InvocationContext {
    /**
     * Snapshot of the allowlisted environment for this request. A name
     * missing from the record means "absent in the caller" — the server
     * clears its own copy for the render, preserving absent-vs-empty.
     */
    env: Partial<Record<(typeof ENV_ALLOWLIST)[number], string>>;
    /** Absolute working directory of the calling process, or null. */
    cwd: string | null;
}

export type ContextDecodeResult
    = | { ok: true; context: InvocationContext }
        | { ok: false; error: string };

/**
 * Encode an invocation context as base64 over NUL-delimited KEY=VALUE
 * entries. NUL cannot appear in an environment value, so the framing is
 * unambiguous, and base64 keeps every byte (spaces, quotes, newlines,
 * Unicode) intact inside a single HTTP header. The shell client builds the
 * same shape with printf '%s=%s\\0' piped through base64.
 */
export function encodeContext(context: InvocationContext): string {
    const entries: string[] = [];
    for (const name of ENV_ALLOWLIST) {
        const value = context.env[name];
        if (value !== undefined) {
            entries.push(`${name}=${value}`);
        }
    }
    if (context.cwd !== null) {
        entries.push(`${CWD_KEY}=${context.cwd}`);
    }
    return Buffer.from(entries.join('\0'), 'utf8').toString('base64');
}

function isBase64Value(value: string): boolean {
    // Strict charset + length: Node's decoder silently ignores invalid
    // characters, which would turn a corrupt header into an empty context.
    return value.length > 0
        && value.length % 4 === 0
        && /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}

/**
 * Decode and validate a context header. Validation here is syntactic
 * (framing, allowlist, absolute cwd); the server checks that cwd exists
 * before rendering, since the filesystem may change between encode and use.
 */
export function decodeContext(headerValue: string): ContextDecodeResult {
    if (headerValue.length > MAX_CONTEXT_BYTES) {
        return { ok: false, error: `context header exceeds ${MAX_CONTEXT_BYTES} bytes` };
    }
    if (!isBase64Value(headerValue)) {
        return { ok: false, error: 'context header is not valid base64' };
    }

    const text = Buffer.from(headerValue, 'base64').toString('utf8');
    const context: InvocationContext = { env: {}, cwd: null };

    for (const entry of text.split('\0')) {
        if (entry === '') {
            continue;
        }
        const separator = entry.indexOf('=');
        if (separator <= 0) {
            return { ok: false, error: `context entry '${entry.slice(0, 32)}' is not KEY=VALUE` };
        }
        const name = entry.slice(0, separator);
        const value = entry.slice(separator + 1);

        if (name === CWD_KEY) {
            if (context.cwd !== null) {
                return { ok: false, error: 'duplicate cwd entry in context' };
            }
            if (!value.startsWith('/')) {
                return { ok: false, error: 'context cwd must be an absolute path' };
            }
            context.cwd = value;
            continue;
        }

        if (!(ENV_ALLOWLIST as readonly string[]).includes(name)) {
            return { ok: false, error: `context env var '${name}' is not on the allowlist` };
        }
        if (context.env[name as keyof InvocationContext['env']] !== undefined) {
            return { ok: false, error: `duplicate env entry for '${name}' in context` };
        }
        context.env[name as keyof InvocationContext['env']] = value;
    }

    return { ok: true, context };
}

/** Fresh per-daemon bearer token; shared only through the discovery file. */
export function makeToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Constant-time comparison. Both sides are hashed first so the comparison
 * length is fixed and cannot leak the token length or a match prefix.
 */
export function tokensMatch(expected: string, provided: string): boolean {
    const expectedHash = crypto.createHash('sha256').update(expected).digest();
    const providedHash = crypto.createHash('sha256').update(provided).digest();
    return crypto.timingSafeEqual(expectedHash, providedHash);
}
