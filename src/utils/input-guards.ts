export interface InputKeyLike {
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    tab?: boolean;
}

const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/u;

export const shouldInsertInput = (input: string, key: InputKeyLike): boolean => {
    if (!input) {
        return false;
    }

    if (key.ctrl || key.meta || key.tab) {
        return false;
    }

    return !CONTROL_CHAR_REGEX.test(input);
};