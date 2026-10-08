import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { contractFixture } from '@/test/contract-fixture'

afterEach(cleanup)

// `findBy` and `waitFor` give up after 1,000 ms by default, which a busy machine (a CI runner
// running many test files at once) can spend before the first render of the app. A wait only
// lasts as long as the thing it waits for, so a longer limit costs nothing when the machine is
// idle. It stays below the test timeout in the Vite config, so a wait that never ends still fails
// with its own message instead of a bare timeout.
configure({ asyncUtilTimeout: 5000 })

// jsdom has no matchMedia; this default reports "no match" and never fires.
beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
    }))
})

// The dashboard asks `/meta` before it decides what to show, so a test that renders the app and
// says nothing about the network still gets an answer for it (a dashboard with runs). Any other
// request is a test that forgot to mock it: it is refused and recorded, and `afterEach` fails
// the test, so it can never pass by looking like a network outage. A test that stubs its own
// `fetch` replaces this one.
const unmocked: string[] = []

beforeEach(() => {
    unmocked.length = 0
    vi.stubGlobal('fetch', (url: string) => {
        if (url.includes('/api/meta')) {
            return Promise.resolve(
                new Response(JSON.stringify(contractFixture('meta'))),
            )
        }

        unmocked.push(url)

        return Promise.reject(new Error(`Unmocked fetch: ${url}`))
    })
})

afterEach(() => {
    expect(unmocked.splice(0)).toEqual([])
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
