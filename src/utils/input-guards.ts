export interface InputKeyLike {
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    tab?: boolean;
}

const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/u;

// Letter shortcuts compare against this rather than the raw input, so ctrl and
// alt/option combos never trigger the plain-letter action (macOS terminals send
// alt+← as ESC b, i.e. meta+b) and stay free for bindings of their own
export function getPlainInput(input: string, key: InputKeyLike): string {
    return key.ctrl || key.meta ? '' : input;
}

export const shouldInsertInput = (input: string, key: InputKeyLike): boolean => {
    if (!input) {
        return false;
    }

    if (key.ctrl || key.meta || key.tab) {
        return false;
    }

    return !CONTROL_CHAR_REGEX.test(input);
};
