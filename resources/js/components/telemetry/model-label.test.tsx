import { render, screen } from '@testing-library/react'
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
})
