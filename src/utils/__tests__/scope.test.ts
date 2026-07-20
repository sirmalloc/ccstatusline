import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { getConfigPath } from '../config';
import {
    getProjectConfigPath,
    getProjectInstallTargetPath,
    getScope,
    initScope,
    isScopeSwitchingAvailable,
    setScope
} from '../scope';

describe('scope', () => {
    let projectDir = '';

    beforeEach(() => {
        projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-scope-'));
        vi.spyOn(process, 'cwd').mockReturnValue(projectDir);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        initScope({}); // reset singleton + config path to defaults
        fs.rmSync(projectDir, { recursive: true, force: true });
    });

    it('defaults to global', () => {
        initScope({});
        expect(getScope()).toEqual({ type: 'global' });
        expect(isScopeSwitchingAvailable()).toBe(true);
        expect(getProjectInstallTargetPath()).toBeNull();
    });

    it('explicit --config wins and disables switching', () => {
        fs.mkdirSync(path.join(projectDir, '.claude'), { recursive: true });
        fs.writeFileSync(getProjectConfigPath(projectDir), '{}', 'utf-8');

        initScope({ explicitConfigPath: '/somewhere/custom.json', detectProject: true });

        expect(getScope()).toEqual({ type: 'custom' });
        expect(isScopeSwitchingAvailable()).toBe(false);
        expect(getProjectInstallTargetPath()).toBeNull();
    });

    it('detects a project config in cwd when detectProject is set', () => {
        fs.mkdirSync(path.join(projectDir, '.claude'), { recursive: true });
        fs.writeFileSync(getProjectConfigPath(projectDir), '{}', 'utf-8');

        initScope({ detectProject: true });

        expect(getScope()).toEqual({ type: 'project', root: projectDir });
        expect(getConfigPath()).toBe(getProjectConfigPath(projectDir));
        expect(getProjectInstallTargetPath()).toBe(path.join(projectDir, '.claude', 'settings.local.json'));
    });

    it('does not detect without the flag (piped/hook paths)', () => {
        fs.mkdirSync(path.join(projectDir, '.claude'), { recursive: true });
        fs.writeFileSync(getProjectConfigPath(projectDir), '{}', 'utf-8');

        initScope({});

        expect(getScope()).toEqual({ type: 'global' });
    });

    it('stays global when no project config exists even with detectProject', () => {
        initScope({ detectProject: true });
        expect(getScope()).toEqual({ type: 'global' });
    });

    it('setScope switches both the scope and the config path, both directions', () => {
        initScope({});

        setScope({ type: 'project', root: projectDir });
        expect(getScope()).toEqual({ type: 'project', root: projectDir });
        expect(getConfigPath()).toBe(getProjectConfigPath(projectDir));

        setScope({ type: 'global' });
        expect(getScope()).toEqual({ type: 'global' });
        expect(getConfigPath()).not.toBe(getProjectConfigPath(projectDir));
    });
});
