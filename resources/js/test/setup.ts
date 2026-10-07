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

// jsdom lacks what Radix Select calls on open: pointer capture and scrolling an item into view.
Element.prototype.hasPointerCapture = () => false
Element.prototype.setPointerCapture = () => {}
Element.prototype.releasePointerCapture = () => {}
Element.prototype.scrollIntoView = () => {}

afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
})
