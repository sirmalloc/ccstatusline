import * as fs from 'fs';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { SessionNameWidget } from '../SessionName';

function render(transcriptPath: string | undefined, fileContent: string | null, rawValue = false, isPreview = false) {
    const widget = new SessionNameWidget();
    const context: RenderContext = {
        data: transcriptPath ? { transcript_path: transcriptPath } : undefined,
        isPreview
    };
    const item: WidgetItem = {
        id: 'session-name',
        type: 'session-name',
        rawValue
    };

    const readFileSyncSpy = vi.spyOn(fs, 'readFileSync');
    if (fileContent !== null) {
        readFileSyncSpy.mockImplementation(() => fileContent as never);
    } else {
        readFileSyncSpy.mockImplementation(() => {
            throw new Error('File not found');
        });
    }

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('SessionNameWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should have session category', () => {
        const widget = new SessionNameWidget();
        expect(widget.getCategory()).toBe('Session');
    });

    it('should return preview text when in preview mode', () => {
        const result = render(undefined, null, false, true);
        expect(result).toBe('Session: my-session');
    });

    it('should return raw preview text when in preview mode with rawValue', () => {
        const result = render(undefined, null, true, true);
        expect(result).toBe('my-session');
    });

    it('should return null when no transcript_path', () => {
        const result = render(undefined, null);
        expect(result).toBeNull();
    });

    it('should return null when file is not readable', () => {
        const result = render('/some/path/session.jsonl', null);
        expect(result).toBeNull();
    });

    it('should return null when no custom-title entry exists', () => {
        const content = '{"type":"message","text":"hello"}\n{"type":"response","text":"hi"}';
        const result = render('/some/path/session.jsonl', content);
        expect(result).toBeNull();
    });

    it('should extract session name from custom-title entry', () => {
        const content = '{"type":"message","text":"hello"}\n{"type":"custom-title","customTitle":"My Project"}';
        const result = render('/some/path/session.jsonl', content);
        expect(result).toBe('Session: My Project');
    });

    it('should return raw session name when rawValue is true', () => {
        const content = '{"type":"custom-title","customTitle":"My Project"}';
        const result = render('/some/path/session.jsonl', content, true);
        expect(result).toBe('My Project');
    });

    it('should use most recent custom-title when multiple exist', () => {
        const content = '{"type":"custom-title","customTitle":"Old Name"}\n{"type":"message"}\n{"type":"custom-title","customTitle":"New Name"}';
        const result = render('/some/path/session.jsonl', content);
        expect(result).toBe('Session: New Name');
    });

    it('should skip malformed JSON lines', () => {
        const content = 'not valid json\n{"type":"custom-title","customTitle":"Valid Title"}';
        const result = render('/some/path/session.jsonl', content);
        expect(result).toBe('Session: Valid Title');
    });
});