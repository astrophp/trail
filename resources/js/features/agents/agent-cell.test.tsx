import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '@/api/types'
import { AgentCell } from '@/features/agents/agent-cell'
import { agentPath } from '@/lib/agent-path'
import { agentNamed, agentWith } from '@/test/agents-api'

function show(agent: Agent) {
    return render(
        <MemoryRouter>
            <AgentCell agent={agent} to={agentPath(agent.name)} />
        </MemoryRouter>,
    )
}

describe('the name of the agent', () => {
    it('is the link’s text, with no title that would read it twice', () => {
        show(agentNamed('SupportAssistant'))

        const link = screen.getByRole('link', { name: 'SupportAssistant' })

        expect(link).toHaveTextContent('SupportAssistant')
        expect(link).not.toHaveAttribute('title')
        expect(
            screen.getByText('App\\Ai\\Agents\\SupportAssistant'),
        ).not.toHaveAttribute('title')
    })

    it.each([
        ['', 'name='],
        [' ', 'name=%20'],
        ['   \t', 'name=%20%20%20%09'],
    ])(
        'is shown as "Unnamed agent" for %j, linking by the name as given',
        (name, query) => {
            show(agentWith('SupportAssistant', { name }))

            const link = screen.getByRole('link', { name: 'Unnamed agent' })

            expect(link).toHaveAttribute('href', `/agents/agent?${query}`)
            expect(link).toHaveClass('text-muted-foreground')
            expect(link).not.toHaveAttribute('title')
        },
    )

    it('is not replaced when it only has white space inside it', () => {
        show(agentWith('SupportAssistant', { name: 'Two  words' }))

        expect(screen.getByRole('link', { name: 'Two words' })).not.toHaveClass(
            'text-muted-foreground',
        )
        expect(screen.queryByText('Unnamed agent')).not.toBeInTheDocument()
    })
})

describe('when the room is not enough', () => {
    // A test DOM has no layout: say which elements are cut off and how wide they are, and observe
    // them the way a browser would, once on start.
    const original = {
        scrollWidth: Object.getOwnPropertyDescriptor(
            HTMLElement.prototype,
            'scrollWidth',
        ),
        clientWidth: Object.getOwnPropertyDescriptor(
            HTMLElement.prototype,
            'clientWidth',
        ),
    }

    function cut(cutText: (text: string) => boolean) {
        vi.stubGlobal(
            'ResizeObserver',
            class {
                constructor(private readonly callback: () => void) {}
                observe() {
                    this.callback()
                }
                disconnect() {}
            },
        )
        Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
            configurable: true,
            get() {
                return cutText((this as HTMLElement).textContent ?? '')
                    ? 500
                    : 50
            },
        })
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
            configurable: true,
            get: () => 100,
        })
    }

    afterEach(() => {
        vi.unstubAllGlobals()

        for (const key of ['scrollWidth', 'clientWidth'] as const) {
            if (original[key] === undefined) {
                delete (
                    HTMLElement.prototype as unknown as Record<string, unknown>
                )[key]
            } else {
                Object.defineProperty(HTMLElement.prototype, key, original[key])
            }
        }
    })

    it('keeps the whole name and the whole class as a title when they are cut', async () => {
        cut(() => true)
        show(agentNamed('SupportAssistant'))

        expect(
            await screen.findByRole('link', { name: 'SupportAssistant' }),
        ).toHaveAttribute('title', 'SupportAssistant')
        expect(
            screen.getByText('App\\Ai\\Agents\\SupportAssistant'),
        ).toHaveAttribute('title', 'App\\Ai\\Agents\\SupportAssistant')
    })

    it('has no title on the one that fits, and one on the one that does not', () => {
        cut((text) => text.startsWith('App'))
        show(agentNamed('SupportAssistant'))

        expect(
            screen.getByRole('link', { name: 'SupportAssistant' }),
        ).not.toHaveAttribute('title')
        expect(
            screen.getByText('App\\Ai\\Agents\\SupportAssistant'),
        ).toHaveAttribute('title', 'App\\Ai\\Agents\\SupportAssistant')
    })
})
