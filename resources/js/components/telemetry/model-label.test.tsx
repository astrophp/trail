import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ModelLabel } from '@/components/telemetry/model-label'

describe('ModelLabel', () => {
    it('shows the model in mono and the provider under it', () => {
        render(
            <ModelLabel
                of={{ model: 'gpt-4o', provider: 'openai', streamed: false }}
            />,
        )

        expect(screen.getByText('gpt-4o')).toHaveClass('font-mono')
        expect(screen.getByText('openai')).toBeInTheDocument()
        expect(screen.queryByText(/streamed/)).not.toBeInTheDocument()
    })

    it('says when the run streamed', () => {
        render(
            <ModelLabel
                of={{ model: 'gpt-4o', provider: 'openai', streamed: true }}
            />,
        )

        expect(screen.getByText('openai · streamed')).toBeInTheDocument()
    })

    it('says Not captured for a missing model', () => {
        render(
            <ModelLabel
                of={{ model: null, provider: 'openai', streamed: false }}
            />,
        )

        expect(screen.getByText('Not captured')).toBeInTheDocument()
        expect(screen.getByText('openai')).toBeInTheDocument()
    })

    it('says Not captured for a missing provider', () => {
        render(
            <ModelLabel
                of={{ model: 'gpt-4o', provider: null, streamed: true }}
            />,
        )

        expect(screen.getByText('gpt-4o')).toBeInTheDocument()
        expect(screen.getByText('Not captured · streamed')).toBeInTheDocument()
    })

    it('says Not captured twice when neither was captured', () => {
        render(
            <ModelLabel
                of={{ model: null, provider: null, streamed: false }}
            />,
        )

        expect(screen.getAllByText('Not captured')).toHaveLength(2)
    })

    it('takes a span, which has no streamed field, and shows nothing about streaming', () => {
        render(<ModelLabel of={{ model: 'gpt-4o', provider: 'openai' }} />)

        expect(screen.getByText('gpt-4o')).toBeInTheDocument()
        expect(screen.getByText('openai')).toBeInTheDocument()
        expect(screen.queryByText(/streamed/)).not.toBeInTheDocument()
    })

    it('shows the responding model when it differs from the requested one', () => {
        render(
            <ModelLabel
                of={{
                    model: 'claude-sonnet-4-5',
                    provider: 'anthropic',
                    responding_model: 'claude-sonnet-4-5-20250929',
                }}
                expectResponding
            />,
        )

        expect(screen.getByText('claude-sonnet-4-5')).toBeInTheDocument()
        expect(screen.getByText(/^Responded as/)).toBeInTheDocument()
        expect(screen.getByText('claude-sonnet-4-5-20250929')).toHaveClass(
            'font-mono',
        )
    })

    it('shows nothing more when the responding model is the requested one', () => {
        render(
            <ModelLabel
                of={{
                    model: 'gpt-4o',
                    provider: 'openai',
                    responding_model: 'gpt-4o',
                }}
                expectResponding
            />,
        )

        expect(screen.getAllByText('gpt-4o')).toHaveLength(1)
        expect(screen.queryByText(/Responded as/)).not.toBeInTheDocument()
        expect(screen.queryByText(/not captured/)).not.toBeInTheDocument()
    })

    it('says the responding model was not captured when one was expected', () => {
        render(
            <ModelLabel
                of={{
                    model: 'gpt-4o',
                    provider: 'openai',
                    responding_model: null,
                }}
                expectResponding
            />,
        )

        expect(
            screen.getByText('Responding model not captured'),
        ).toBeInTheDocument()
    })

    it('stays silent about a missing responding model when none was expected', () => {
        render(
            <ModelLabel
                of={{
                    model: 'gpt-4o',
                    provider: 'openai',
                    responding_model: null,
                }}
            />,
        )

        expect(screen.queryByText(/Responding model/)).not.toBeInTheDocument()
    })

    it('accepts a className', () => {
        const { container } = render(
            <ModelLabel
                of={{ model: 'm', provider: 'p', streamed: false }}
                className="extra"
            />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })

    describe('inline', () => {
        it('puts the model and the provider in one group, the model first', () => {
            render(
                <ModelLabel
                    layout="inline"
                    of={{
                        model: 'claude-sonnet-5-5',
                        provider: 'anthropic',
                        streamed: false,
                    }}
                />,
            )

            const group = screen.getByRole('group', {
                name: 'Model and provider',
            })

            expect(group).toHaveTextContent(
                /^claude-sonnet-5-5\s*·\s*anthropic$/,
            )
            expect(within(group).getByText('claude-sonnet-5-5')).toBeVisible()
            expect(within(group).getByText('anthropic')).toBeVisible()
        })

        it('keeps the wording for a model or provider that was not captured', () => {
            const { rerender } = render(
                <ModelLabel
                    layout="inline"
                    of={{ model: null, provider: 'openai' }}
                />,
            )

            expect(screen.getByRole('group')).toHaveTextContent(
                /^Not captured\s*·\s*openai$/,
            )

            rerender(
                <ModelLabel
                    layout="inline"
                    of={{ model: 'gpt-4o', provider: null }}
                />,
            )

            expect(screen.getByRole('group')).toHaveTextContent(
                /^gpt-4o\s*·\s*Not captured$/,
            )

            rerender(
                <ModelLabel
                    layout="inline"
                    of={{ model: null, provider: null }}
                />,
            )

            expect(screen.getByRole('group')).toHaveTextContent(
                /^Not captured\s*·\s*Not captured$/,
            )
        })

        it('has no group when stacked', () => {
            render(<ModelLabel of={{ model: 'gpt-4o', provider: 'openai' }} />)

            expect(screen.queryByRole('group')).not.toBeInTheDocument()
        })
    })
})
