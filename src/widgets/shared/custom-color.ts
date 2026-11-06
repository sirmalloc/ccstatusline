// Accepts what people naturally type for a custom color (#ff8800, ff8800,
// 208) as well as the stored hex:/ansi256: forms; null when it isn't one
export function parseCustomColor(input: string): string | null {
    const value = input.trim();
    const hex = /^(?:hex:|#)?([0-9a-f]{6})$/i.exec(value)?.[1];
    if (hex) {
        return `hex:${hex}`;
    }

    const ansi256 = /^(?:ansi256:)?(\d{1,3})$/.exec(value)?.[1];
    if (ansi256 && Number(ansi256) <= 255) {
        return `ansi256:${ansi256}`;
    }

    return null;
}
