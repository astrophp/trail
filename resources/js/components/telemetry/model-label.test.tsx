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
