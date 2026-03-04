import stringWidth from 'string-width';

const ESC = '\x1b';
const BEL = '\x07';
const C1_CSI = '\x9b';
const C1_OSC = '\x9d';
const ST = '\x9c';

const SGR_REGEX = /\x1b\[[0-9;]*m/g;

type Osc8Action = 'open' | 'close';
type OscTerminator = 'bel' | 'st';

interface ParsedEscapeSequence {
    nextIndex: number;
    sequence: string;
    osc8Action?: Osc8Action;
    osc8Terminator?: OscTerminator;
}

function isCsiFinalByte(codePoint: number): boolean {
    return codePoint >= 0x40 && codePoint <= 0x7e;
}

function parseCsi(input: string, start: number, bodyStart: number): ParsedEscapeSequence {
    let index = bodyStart;
    while (index < input.length) {
        const codePoint = input.charCodeAt(index);
        if (isCsiFinalByte(codePoint)) {
            const end = index + 1;
            return {
                nextIndex: end,
                sequence: input.slice(start, end)
            };
        }
        index++;
    }

    return {
        nextIndex: input.length,
        sequence: input.slice(start)
    };
}

function getOsc8Action(body: string): Osc8Action | undefined {
    if (!body.startsWith('8;')) {
        return undefined;
    }

    const urlStart = body.indexOf(';', 2);
    if (urlStart === -1) {
        return undefined;
    }

    const url = body.slice(urlStart + 1);
    return url.length > 0 ? 'open' : 'close';
}

function parseOsc(
    input: string,
    start: number,
    bodyStart: number
): ParsedEscapeSequence {
    let index = bodyStart;

    while (index < input.length) {
        const current = input[index];
        if (!current) {
            break;
        }

        if (current === BEL) {
            const end = index + 1;
            const body = input.slice(bodyStart, index);
            return {
                nextIndex: end,
                sequence: input.slice(start, end),
                osc8Action: getOsc8Action(body),
                osc8Terminator: 'bel'
            };
        }

        if (current === ST) {
            const end = index + 1;
            const body = input.slice(bodyStart, index);
            return {
                nextIndex: end,
                sequence: input.slice(start, end),
                osc8Action: getOsc8Action(body),
                osc8Terminator: 'st'
            };
        }

        if (current === ESC && input[index + 1] === '\\') {
            const end = index + 2;
            const body = input.slice(bodyStart, index);
            return {
                nextIndex: end,
                sequence: input.slice(start, end),
                osc8Action: getOsc8Action(body),
                osc8Terminator: 'st'
            };
        }

        index++;
    }

    return {
        nextIndex: input.length,
        sequence: input.slice(start)
    };
}

function parseEscapeSequence(input: string, index: number): ParsedEscapeSequence | null {
    const current = input[index];
    if (!current) {
        return null;
    }

    if (current === ESC) {
        const next = input[index + 1];
        if (next === '[') {
            return parseCsi(input, index, index + 2);
        }
        if (next === ']') {
            return parseOsc(input, index, index + 2);
        }
        if (next) {
            return {
                nextIndex: index + 2,
                sequence: input.slice(index, index + 2)
            };
        }
        return {
            nextIndex: input.length,
            sequence: current
        };
    }

    if (current === C1_CSI) {
        return parseCsi(input, index, index + 1);
    }

    if (current === C1_OSC) {
        return parseOsc(input, index, index + 1);
    }

    return null;
}

function getOsc8CloseSequence(terminator: OscTerminator): string {
    if (terminator === 'bel') {
        return `${ESC}]8;;${BEL}`;
    }
    return `${ESC}]8;;${ESC}\\`;
}

export function stripSgrCodes(text: string): string {
    return text.replace(SGR_REGEX, '');
}

export function getVisibleText(text: string): string {
    let result = '';
    let index = 0;

    while (index < text.length) {
        const escape = parseEscapeSequence(text, index);
        if (escape) {
            index = escape.nextIndex;
            continue;
        }

        const codePoint = text.codePointAt(index);
        if (codePoint === undefined) {
            break;
        }

        const character = String.fromCodePoint(codePoint);
        result += character;
        index += character.length;
    }

    return result;
}

export function getVisibleWidth(text: string): number {
    return stringWidth(getVisibleText(text));
}

interface TruncateOptions { ellipsis?: boolean }

export function truncateStyledText(
    text: string,
    maxWidth: number,
    options: TruncateOptions = {}
): string {
    if (maxWidth <= 0) {
        return '';
    }

    if (getVisibleWidth(text) <= maxWidth) {
        return text;
    }

    const addEllipsis = options.ellipsis ?? true;
    const ellipsis = addEllipsis ? '...' : '';
    const ellipsisWidth = addEllipsis ? stringWidth(ellipsis) : 0;

    if (addEllipsis && maxWidth <= ellipsisWidth) {
        return '.'.repeat(maxWidth);
    }

    const targetWidth = Math.max(0, maxWidth - ellipsisWidth);
    let output = '';
    let currentWidth = 0;
    let index = 0;
    let didTruncate = false;
    let openOsc8Terminator: OscTerminator | null = null;

    while (index < text.length) {
        const escape = parseEscapeSequence(text, index);
        if (escape) {
            output += escape.sequence;
            index = escape.nextIndex;

            if (escape.osc8Action === 'open') {
                openOsc8Terminator = escape.osc8Terminator ?? 'st';
            } else if (escape.osc8Action === 'close') {
                openOsc8Terminator = null;
            }
            continue;
        }

        const codePoint = text.codePointAt(index);
        if (codePoint === undefined) {
            break;
        }

        const character = String.fromCodePoint(codePoint);
        const charWidth = stringWidth(character);

        if (currentWidth + charWidth > targetWidth) {
            didTruncate = true;
            break;
        }

        output += character;
        currentWidth += charWidth;
        index += character.length;
    }

    if (!didTruncate) {
        return text;
    }

    if (openOsc8Terminator) {
        output += getOsc8CloseSequence(openOsc8Terminator);
    }

    return output + ellipsis;
}