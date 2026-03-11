import type { WidgetItem } from '../types/Widget';

import type { ProfileData } from './profile-fetch';
import { fetchProfileData } from './profile-fetch';
import type { SessionAccount } from './session-affinity';

const PROFILE_WIDGET_TYPES = new Set<string>([
    'account-email'
]);

export function hasProfileDependentWidgets(lines: WidgetItem[][]): boolean {
    return lines.some(line => line.some(item => PROFILE_WIDGET_TYPES.has(item.type)));
}

export async function prefetchProfileDataIfNeeded(lines: WidgetItem[][], session?: SessionAccount): Promise<ProfileData | null> {
    if (!hasProfileDependentWidgets(lines)) {
        return null;
    }

    return await fetchProfileData(session);
}
