import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

afterEach(cleanup)

// jsdom has no matchMedia; this default reports "no match" and never fires.
beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
    }))
})

// jsdom does not implement scrolling.
beforeEach(() => {
    window.scrollTo = vi.fn()
})

afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
})
