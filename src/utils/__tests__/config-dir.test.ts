import * as os from 'os';
import * as path from 'path';
import {
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    getConfigPath,
    initConfigPath,
    isCustomConfigPath
} from '../config';

const DEFAULT_PATH = path.join(os.homedir(), '.config', 'ccstatusline', 'settings.json');

describe('initConfigPath / getConfigPath', () => {
    beforeEach(() => {
        initConfigPath();
    });

    it('should return the default settings path when no arg is provided', () => {
        initConfigPath();
        expect(getConfigPath()).toBe(DEFAULT_PATH);
        expect(isCustomConfigPath()).toBe(false);
    });

    it('should return a custom settings path when a file path is provided', () => {
        initConfigPath('/tmp/my-ccsl/settings.json');
        expect(getConfigPath()).toBe('/tmp/my-ccsl/settings.json');
        expect(isCustomConfigPath()).toBe(true);
    });

    it('should resolve relative paths', () => {
        initConfigPath('relative/settings.json');
        expect(path.isAbsolute(getConfigPath())).toBe(true);
        expect(getConfigPath()).toBe(path.resolve('relative/settings.json'));
    });

    it('should reset to default when called with undefined', () => {
        initConfigPath('/tmp/custom.json');
        expect(isCustomConfigPath()).toBe(true);
        initConfigPath(undefined);
        expect(getConfigPath()).toBe(DEFAULT_PATH);
        expect(isCustomConfigPath()).toBe(false);
    });
});