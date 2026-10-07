import { render } from '@testing-library/react'
import { App } from '@/app/app'
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

/**
 * Renders the whole app at `route` (relative to the dashboard's base path), through the
 * real browser router: the URL is set first, as the server would have served it.
 */
export function renderApp(
    route = '/',
    overrides: Record<string, unknown> = {},
) {
    const boot = testBoot(overrides)
    const base = boot.path === '/' ? '' : boot.path

    window.history.pushState({}, '', `${base}${route}`)

    return render(<App boot={boot} />)
}
