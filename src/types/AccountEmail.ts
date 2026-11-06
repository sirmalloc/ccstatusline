export type AccountEmailResult = { status: 'available'; email: string }
    | { status: 'no-credentials' }
    | { status: 'unavailable' };
