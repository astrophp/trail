import { vi } from 'vitest'

/**
 * jsdom has no `ResizeObserver`, which cmdk (the command palette's list) creates when it mounts.
 * Not installed for every test: the charts measure themselves when it exists and the other tests
 * rely on them not doing so. The setup's `unstubAllGlobals` puts it back after the test.
 */
export function stubResizeObserver() {
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    )
}
