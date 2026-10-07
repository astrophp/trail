import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TraceError } from '@/api/types'
import { ErrorSummary } from '@/components/telemetry/error-summary'

const full: TraceError = {
    class: 'Laravel\\Ai\\Exceptions\\RateLimitedException',
    message: 'Application rate limited by AI provider [anthropic].',
    source: 'step',
    http_status: 429,
}

describe('ErrorSummary', () => {
    it('shows every part of a full error', () => {
        render(<ErrorSummary error={full} issueKind="rate_limited" />)

        expect(screen.getByRole('group', { name: 'Error' })).toBeInTheDocument()
        expect(screen.getByText('Rate limited')).toBeInTheDocument()
        expect(screen.getByText(full.class!)).toHaveClass('font-mono')
        expect(screen.getByText('HTTP 429')).toBeInTheDocument()
        expect(screen.getByText('Raised by a model step')).toBeInTheDocument()
        expect(screen.getByText(full.message!)).toBeInTheDocument()
    })

    it.each([
        ['step', 'Raised by a model step'],
        ['tool', 'Raised by a tool'],
        ['run', 'Raised by the run'],
    ] as const)('says where a %s error was raised', (source, words) => {
        render(
            <ErrorSummary error={{ ...full, source }} issueKind="exception" />,
        )

        expect(screen.getByText(words)).toBeInTheDocument()
    })

    it('leaves out a missing class', () => {
        render(
            <ErrorSummary
                error={{ ...full, class: null }}
                issueKind="rate_limited"
            />,
        )

        expect(screen.getByText('HTTP 429')).toBeInTheDocument()
        expect(screen.queryByText(/RateLimitedException/)).toBeNull()
    })

    it('leaves out a missing status', () => {
        render(
            <ErrorSummary
                error={{ ...full, http_status: null }}
                issueKind="rate_limited"
            />,
        )

        expect(screen.getByText(full.class!)).toBeInTheDocument()
        expect(screen.queryByText(/HTTP/)).toBeNull()
    })

    it('leaves out a missing source', () => {
        render(
            <ErrorSummary
                error={{ ...full, source: null }}
                issueKind="rate_limited"
            />,
        )

        expect(screen.getByText(full.message!)).toBeInTheDocument()
        expect(screen.queryByText(/Raised by/)).toBeNull()
    })

    it('leaves out a missing message', () => {
        render(
            <ErrorSummary
                error={{ ...full, message: null }}
                issueKind="rate_limited"
            />,
        )

        expect(screen.getByText('HTTP 429')).toBeInTheDocument()
        expect(screen.queryByText(/rate limited by AI provider/)).toBeNull()
    })

    it('leaves out a missing issue kind', () => {
        render(<ErrorSummary error={full} issueKind={null} />)

        expect(screen.getByText(full.message!)).toBeInTheDocument()
        expect(screen.queryByText('Rate limited')).toBeNull()
    })

    it('shows only the issue kind when every part of the error was not recorded', () => {
        render(
            <ErrorSummary
                error={{
                    class: null,
                    message: null,
                    source: null,
                    http_status: null,
                }}
                issueKind="exception"
            />,
        )

        expect(screen.getByText('Exception')).toBeInTheDocument()
        expect(screen.queryByText('No error was recorded.')).toBeNull()
        expect(screen.queryByText(/HTTP|Raised by/)).toBeNull()
    })

    it('renders nothing when no issue kind is known and no part of the error was recorded', () => {
        const { container } = render(
            <ErrorSummary
                error={{
                    class: null,
                    message: null,
                    source: null,
                    http_status: null,
                }}
                issueKind={null}
            />,
        )

        expect(container).toBeEmptyDOMElement()
    })

    it('renders no paragraph for a source it does not know', () => {
        render(
            <ErrorSummary
                error={{
                    ...full,
                    source: 'sideways' as unknown as 'step',
                }}
                issueKind="exception"
            />,
        )

        expect(screen.getByText(full.message!)).toBeInTheDocument()
        expect(screen.queryByText(/Raised by/)).toBeNull()
        expect(
            document.querySelectorAll('[data-slot="error-summary"] p'),
        ).toHaveLength(2)
    })

    it('shows the issue kind alone when no exception was recorded', () => {
        render(<ErrorSummary error={null} issueKind="abandoned" />)

        expect(screen.getByText('Abandoned')).toBeInTheDocument()
        expect(screen.getByText('No error was recorded.')).toBeInTheDocument()
    })

    it('renders nothing when there is neither an error nor an issue kind', () => {
        const { container } = render(
            <ErrorSummary error={null} issueKind={null} />,
        )

        expect(container).toBeEmptyDOMElement()
    })

    it('keeps line breaks and wraps long tokens', () => {
        render(
            <ErrorSummary
                error={{ ...full, message: 'line one\nline two' }}
                issueKind={null}
            />,
        )

        const message = screen.getByText(/line one/)

        expect(message.textContent).toBe('line one\nline two')
        expect(message).toHaveClass('whitespace-pre-wrap', 'break-words')
    })

    it('renders HTML-looking text as text', () => {
        const markup = '<script>alert(1)</script><b>bold</b>'
        const { container } = render(
            <ErrorSummary
                error={{ ...full, message: markup }}
                issueKind={null}
            />,
        )

        expect(screen.getByText(markup)).toBeInTheDocument()
        expect(container.querySelector('script')).toBeNull()
        expect(container.querySelector('b')).toBeNull()
    })

    it('accepts a className', () => {
        const { container } = render(
            <ErrorSummary
                error={full}
                issueKind="rate_limited"
                className="extra"
            />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
