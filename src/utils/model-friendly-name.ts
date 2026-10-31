/**
 * Parses a raw model ID string and returns a user-friendly display name.
 *
 * Handles Claude 4+ format (family before version):
 *   global.anthropic.claude-opus-4-6-v1[1m]
 *   us.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]
 *   anthropic.claude-haiku-4-5-20251001-v1:0
 *   claude-sonnet-4-5-20250929[1m]
 *
 * Handles Claude 3.x format (version before family):
 *   anthropic.claude-3-5-haiku-20241022-v1:0
 *   us.anthropic.claude-3-7-sonnet-20250219-v1:0
 *   anthropic.claude-3-opus-20240229-v1:0
 *
 * Returns the original string if it cannot be parsed.
 */
export function getFriendlyModelName(modelId: string): string {
    // Claude 4+ format: claude-{family}-{major}-{minor}[-date][-vN][:N][[1m]]
    const claude4Match = /(?:[\w.-]*\.)?claude-(\w+)-(\d+)-(\d+)(?:-\d{8})?(?:-v\d+)?(?::\d+)?(\[1[mM]\])?$/.exec(modelId);

    if (claude4Match) {
        const [, rawFamily, major, minor, extendedContext] = claude4Match;

        if (rawFamily && major && minor) {
            const family = rawFamily.charAt(0).toUpperCase() + rawFamily.slice(1);
            const name = `${family} ${major}.${minor}`;
            return extendedContext ? `${name} (1M context)` : name;
        }
    }

    // Claude 3.x format with minor version: claude-{major}-{minor}-{family}[-date][-vN][:N][:Nk]
    const claude3MinorMatch = /(?:[\w.-]*\.)?claude-(\d+)-(\d+)-(\w+)(?:-\d{8})?(?:-v\d+)?(?::\d+)?(?::\d+k)?(\[1[mM]\])?$/.exec(modelId);

    if (claude3MinorMatch) {
        const [, major, minor, rawFamily, extendedContext] = claude3MinorMatch;

        if (major && minor && rawFamily) {
            const family = rawFamily.charAt(0).toUpperCase() + rawFamily.slice(1);
            const name = `${family} ${major}.${minor}`;
            return extendedContext ? `${name} (1M context)` : name;
        }
    }

    // Claude 3.x format without minor version: claude-{major}-{family}[-date][-vN][:N][:Nk]
    const claude3Match = /(?:[\w.-]*\.)?claude-(\d+)-(\w+)(?:-\d{8})?(?:-v\d+)?(?::\d+)?(?::\d+k)?(\[1[mM]\])?$/.exec(modelId);

    if (claude3Match) {
        const [, major, rawFamily, extendedContext] = claude3Match;

        if (major && rawFamily) {
            const family = rawFamily.charAt(0).toUpperCase() + rawFamily.slice(1);
            const name = `${family} ${major}`;
            return extendedContext ? `${name} (1M context)` : name;
        }
    }

    return modelId;
}