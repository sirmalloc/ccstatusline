import * as fs from 'fs';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    CURRENT_VERSION,
    SettingsSchema
} from '../../types/Settings';
import {
    getSettingsConfiguration,
    loadSettings,
    saveSettings
} from '../config';

vi.mock('os', () => ({ homedir: vi.fn().mockReturnValue('/some-home-dir') }));

vi.mock('fs', () => ({
    existsSync: vi.fn(),
    promises: {
        mkdir: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn()
    }
}));

const globalConfig = '/some-home-dir/.config/ccstatusline/settings.json';
const projectConfig = '/some-project-dir/.claude/ccstatusline.json';

function setGlobalConfig() {
    vi.mocked(fs.existsSync).mockImplementation(path => path === globalConfig);
}

function setProjectConfig() {
    vi.mocked(fs.existsSync).mockImplementation(path => path === projectConfig);
}

describe('config', () => {
    beforeEach(() => {
        setProjectConfig();

        vi.clearAllMocks();
        vi.spyOn(process, 'cwd').mockReturnValue('/some-project-dir');
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
        vi.mocked(fs.promises.readFile).mockResolvedValue('{}');
        vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
    });

    it('should return project config', () => {
        setProjectConfig();

        const configuration = getSettingsConfiguration();
        expect(configuration.type).toBe('project');
        expect(configuration.relativePath).toBe('.claude/ccstatusline.json');
        expect(configuration.path).toBe(projectConfig);
    });

    it('should return global config', () => {
        setGlobalConfig();

        const configuration = getSettingsConfiguration();
        expect(configuration.type).toBe('global');
        expect(configuration.relativePath).toBe('~/.config/ccstatusline/settings.json');
        expect(configuration.path).toBe(globalConfig);
    });

    it('should write default settings', async () => {
        // Results in global config
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const settings = await loadSettings();
        const defaultSettings = SettingsSchema.parse({});

        expect(vi.mocked(fs.promises.writeFile)).toHaveBeenCalledWith(globalConfig, JSON.stringify(defaultSettings, null, 2), 'utf-8');

        expect(settings.version).toBe(CURRENT_VERSION);
    });

    it('should backup bad settings', async () => {
        vi.mocked(fs.promises.readFile).mockResolvedValue('invalid');

        const backupPath = '/some-project-dir/.claude/ccstatusline.json.bak';

        const settings = await loadSettings();

        expect(vi.mocked(fs.promises.writeFile)).toHaveBeenCalledWith(backupPath, 'invalid', 'utf-8');
        expect(settings.version).toBe(CURRENT_VERSION);
    });

    it('should save settings to default location - global', async () => {
        setGlobalConfig();

        const settings = await loadSettings();
        await saveSettings(settings);

        expect(vi.mocked(fs.promises.writeFile)).toHaveBeenCalledWith(globalConfig, JSON.stringify(settings, null, 2), 'utf-8');
    });

    it('should save settings to default location - project', async () => {
        setProjectConfig();

        const settings = await loadSettings();
        await saveSettings(settings);

        expect(vi.mocked(fs.promises.writeFile)).toHaveBeenCalledWith(projectConfig, JSON.stringify(settings, null, 2), 'utf-8');
    });

    it('should save settings to specified location - global', async () => {
        setProjectConfig();

        const config = getSettingsConfiguration();
        expect(config.type).toBe('project');

        const settings = await loadSettings();

        await saveSettings(settings, 'global');

        expect(vi.mocked(fs.promises.writeFile)).toHaveBeenCalledWith(globalConfig, JSON.stringify(settings, null, 2), 'utf-8');
    });

    it('should save settings to specified location - project', async () => {
        setGlobalConfig();

        const config = getSettingsConfiguration();
        expect(config.type).toBe('global');

        const settings = await loadSettings();

        await saveSettings(settings, 'project');

        expect(vi.mocked(fs.promises.writeFile)).toHaveBeenCalledWith(projectConfig, JSON.stringify(settings, null, 2), 'utf-8');
    });
});