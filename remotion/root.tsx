import { Composition } from 'remotion';

import { TUIDemo } from './tuiDemo';

export const RemotionRoot = () => {
    return (
        <Composition
            id='ccstatusline-tui-demo'
            component={TUIDemo}
            durationInFrames={1470}
            fps={30}
            width={1322}
            height={862}
        />
    );
};
