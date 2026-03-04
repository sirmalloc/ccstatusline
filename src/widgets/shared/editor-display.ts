export function makeModifierText(modifiers: string[]): string | undefined {
    return modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined;
}