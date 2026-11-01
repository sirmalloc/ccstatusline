import { useInput } from 'ink';
import {
    useCallback,
    useEffect,
    useRef,
    useState
} from 'react';

/** Blink only while an editor cursor is mounted; input starts a fresh visible phase. */
export function useCursorBlink(): boolean {
    const [visible, setVisible] = useState(true);
    const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
    const restart = useCallback(() => {
        clearInterval(timer.current);
        timer.current = setInterval(() => {
            setVisible(previous => !previous);
        }, 500);
    }, []);

    useEffect(() => {
        restart();
        return () => {
            clearInterval(timer.current);
        };
    }, [restart]);

    useInput(() => {
        setVisible(true);
        restart();
    });

    return visible;
}
