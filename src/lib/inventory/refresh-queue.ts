interface RefreshQueueOptions {
    delayMs?: number;
    isLoading: () => boolean;
    refresh: () => void;
}

// Coalesce notifications without starving a refresh during continuous syncs.
// The caller invokes idle() when its current request settles, including errors.
export function createRefreshQueue({ delayMs = 750, isLoading, refresh }: RefreshQueueOptions) {
    let pending = false;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
        if (disposed || !pending || timer !== null) return;
        timer = setTimeout(() => {
            timer = null;
            if (disposed || !pending || isLoading()) return;
            pending = false;
            refresh();
        }, delayMs);
    };
    return {
        request() {
            if (disposed) return;
            pending = true;
            schedule();
        },
        idle: schedule,
        dispose() {
            disposed = true;
            pending = false;
            if (timer !== null) clearTimeout(timer);
            timer = null;
        },
    };
}
