import React, {
    Suspense,
    lazy
} from 'react';

// Widget instances are also constructed in piped mode. Defer Ink (including
// its input hook's reconciler/Yoga graph) until an editor is actually rendered.
export function lazyEditor<Props extends object>(load: () => Promise<{ default: React.ComponentType<Props> }>): React.FC<Props> {
    const Editor = lazy(load);
    return function LazyEditor(props: Props) {
        return (
            <Suspense fallback={null}>
                <Editor {...props} />
            </Suspense>
        );
    };
}
