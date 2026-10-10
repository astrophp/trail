import { ErrorSummary } from '@/components/telemetry/error-summary'
import type { TraceError } from '@/api/types'
import type { CatalogueEntry } from '@/catalogue/types'

const full: TraceError = {
    class: 'Laravel\\Ai\\Exceptions\\RateLimitedException',
    message: 'Application rate limited by AI provider [anthropic].',
    source: 'step',
    http_status: 429,
}

export const catalogue: CatalogueEntry = {
    title: 'Error summary',
    specimens: [
        {
            name: 'Full',
            Component: () => (
                <ErrorSummary error={full} issueKind="rate_limited" />
            ),
        },
        {
            name: 'From a tool, no status',
            Component: () => (
                <ErrorSummary
                    error={{ ...full, source: 'tool', http_status: null }}
                    issueKind="tool_error"
                />
            ),
        },
        {
            name: 'Only a message',
            Component: () => (
                <ErrorSummary
                    error={{
                        class: null,
                        message: 'Something went wrong.',
                        source: null,
                        http_status: null,
                    }}
                    issueKind={null}
                />
            ),
        },
        {
            name: 'Multi-line message and a long token',
            Component: () => (
                <ErrorSummary
                    error={{
                        ...full,
                        source: 'run',
                        message: `First line\nSecond line ${'x'.repeat(120)}`,
                    }}
                    issueKind="exception"
                />
            ),
        },
        {
            name: 'HTML-looking message (shown as text)',
            Component: () => (
                <ErrorSummary
                    error={{ ...full, message: '<script>alert(1)</script>' }}
                    issueKind="exception"
                />
            ),
        },
        {
            name: 'Issue kind only (abandoned)',
            Component: () => (
                <ErrorSummary error={null} issueKind="abandoned" />
            ),
        },
        {
            name: 'Nothing (renders nothing)',
            Component: () => (
                <div className="text-ui text-muted-foreground">
                    [<ErrorSummary error={null} issueKind={null} />]
                </div>
            ),
        },
    ],
}
