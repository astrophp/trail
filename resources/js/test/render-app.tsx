import { render, screen } from '@testing-library/react'
import { App } from '@/app/app'
import { createQueryClient } from '@/app/providers/query-provider'
import { parseBoot, type Boot } from '@/lib/boot'

/** A boot object as the Blade page would write it, with some fields replaced. */
export function testBoot(overrides: Record<string, unknown> = {}): Boot {
    return parseBoot({
        path: '/trail',
        apiPath: '/trail/api',
        csrfToken: 'token',
        appName: 'Acme Support',
        environment: 'production',
        timezone: 'UTC',
        version: 'v0.1.0',
        staleAfter: 3600,
        recording: 'enabled',
        ...overrides,
    })
}

/** A fresh client for one test: the dashboard's defaults, without retries. */
export function testQueryClient() {
    return createQueryClient({ queries: { retry: false } })
}

/**
 * Renders the whole app at `route` (relative to the dashboard's base path), through the
 * real browser router: the URL is set first, as the server would have served it.
 */
export function renderApp(
    route = '/',
    overrides: Record<string, unknown> = {},
    queryClient = testQueryClient(),
) {
    const boot = testBoot(overrides)
    const base = boot.path === '/' ? '' : boot.path

    window.history.pushState({}, '', `${base}${route}`)

    return render(<App boot={boot} queryClient={queryClient} />)
}

/**
 * Waits until the app has its first meta answer: until then the content area is empty, so a test
 * that looks for the page right after `renderApp` waits here first. "Updated …" appears in the
 * top bar once the answer is in.
 */
export async function appReady() {
    await screen.findByText(/^Updated /)
}
