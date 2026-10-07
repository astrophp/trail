import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgentIcon } from '@/components/telemetry/agent-icon'

describe('AgentIcon', () => {
    it('shows an icon for an agent run', () => {
        render(<AgentIcon type="agent" />)

        expect(
            screen.getByRole('img', { name: 'Agent run' }),
        ).toBeInTheDocument()
    })

    it('shows another icon for an embedding run', () => {
        const { container: agent } = render(<AgentIcon type="agent" />)
        const { container: embedding } = render(<AgentIcon type="embedding" />)

        expect(
            screen.getByRole('img', { name: 'Embedding run' }),
        ).toBeInTheDocument()
        expect(agent.querySelector('svg')!.innerHTML).not.toBe(
            embedding.querySelector('svg')!.innerHTML,
        )
    })

    it('accepts a className', () => {
        const { container } = render(
            <AgentIcon type="agent" className="extra" />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
