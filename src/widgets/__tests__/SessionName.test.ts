import * as fs from 'fs';
import os from 'os';
import path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { SessionNameWidget } from '../SessionName';

let tempDir: string;

function render(transcriptPath: string | undefined, fileContent: string | null, rawValue = false, isPreview = false) {
    const widget = new SessionNameWidget();
    const resolvedTranscriptPath = transcriptPath ? path.join(tempDir, 'session.jsonl') : undefined;
    if (resolvedTranscriptPath && fileContent !== null) {
        fs.writeFileSync(resolvedTranscriptPath, fileContent);
    }
    const context: RenderContext = {
        data: resolvedTranscriptPath ? { transcript_path: resolvedTranscriptPath } : undefined,
        isPreview
    };
    const item: WidgetItem = {
        id: 'session-name',
        type: 'session-name',
        rawValue
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('SessionNameWidget', () => {
    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-session-name-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
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

    it('uses a session name precomputed by the shared transcript analysis', () => {
        const widget = new SessionNameWidget();
        const result = widget.render(
            { id: 'session-name', type: 'session-name' },
            {
                data: { transcript_path: path.join(tempDir, 'missing.jsonl') },
                transcriptSessionName: 'Precomputed Session'
            },
            DEFAULT_SETTINGS
        );

        expect(result).toBe('Session: Precomputed Session');
    });

    it('should skip malformed JSON lines', () => {
        const content = 'not valid json\n{"type":"custom-title","customTitle":"Valid Title"}';
        const result = render('/some/path/session.jsonl', content);
        expect(result).toBe('Session: Valid Title');
    });

    it('reads the latest title from a transcript larger than Node maximum string length', () => {
        const transcriptPath = path.join(tempDir, 'huge-session.jsonl');
        const handle = fs.openSync(transcriptPath, 'w');
        try {
            fs.writeSync(
                handle,
                '\n{"type":"custom-title","customTitle":"Huge Session"}',
                undefined,
                'utf8'
            );
            fs.writeSync(
                handle,
                '\n{"type":"custom-title","customTitle":"Latest Huge Session"}',
                0x1fffffe8 + 1024,
                'utf8'
            );
        } finally {
            fs.closeSync(handle);
        }

        const widget = new SessionNameWidget();
        const result = widget.render(
            { id: 'session-name', type: 'session-name' },
            { data: { transcript_path: transcriptPath } },
            DEFAULT_SETTINGS
        );

        expect(result).toBe('Session: Latest Huge Session');
    });
});
