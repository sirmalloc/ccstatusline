import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getTranscriptActivity } from '../utils/transcript-activity';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const MAX_TASK_LENGTH = 50;

function truncateContent(content: string): string {
    if (content.length <= MAX_TASK_LENGTH) {
        return content;
    }

    return `${content.slice(0, MAX_TASK_LENGTH - 3)}...`;
}

export class TasksWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows the current Claude task and overall task progress from the transcript'; }
    getDisplayName(): string { return 'Tasks'; }
    getCategory(): string { return 'Session'; }
    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: '(current + progress)'
        };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Tasks: ', 'Add tests (2/5)');
        }

        const activity = getTranscriptActivity(context.data?.transcript_path);
        if (activity.tasks.length === 0) {
            return null;
        }

        const completed = activity.tasks.filter(task => task.status === 'completed').length;
        const total = activity.tasks.length;
        const inProgress = activity.tasks.find(task => task.status === 'in_progress');

        if (inProgress) {
            return formatRawOrLabeledValue(item, 'Tasks: ', `${truncateContent(inProgress.content)} (${completed}/${total})`);
        }

        if (completed === total) {
            return formatRawOrLabeledValue(item, 'Tasks: ', `done (${completed}/${total})`);
        }

        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}