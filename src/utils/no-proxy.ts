/**
 * Whether NO_PROXY (or no_proxy) keeps HTTPS requests to `host` off the proxy:
 * `*`, the host itself, or a domain it's in (`anthropic.com`, `.anthropic.com`
 * or `*.anthropic.com`), each optionally with `:443`. Both spellings are read,
 * since honoring an exclusion only ever sends less through the proxy.
 */
export function isExcludedFromProxy(host: string, env: NodeJS.ProcessEnv = process.env): boolean {
    const target = host.toLowerCase();
    const entries = [env.NO_PROXY, env.no_proxy]
        .filter((value): value is string => typeof value === 'string')
        .flatMap(value => value.split(/[\s,]+/));

    return entries.some((rawEntry) => {
        let entry = rawEntry.toLowerCase();
        const portStart = entry.lastIndexOf(':');
        if (portStart !== -1) {
            if (entry.slice(portStart + 1) !== '443') {
                return false;
            }
            entry = entry.slice(0, portStart);
        }

        if (entry === '*') {
            return true;
        }

        const domain = entry.replace(/^\*?\./, '');
        return domain !== '' && (target === domain || target.endsWith(`.${domain}`));
    });
}
