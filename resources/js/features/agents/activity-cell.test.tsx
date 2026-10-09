import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { Agent } from '@/api/types'
import { sparklinePath } from '@/components/patterns/sparkline-path'
import { AgentsTable } from '@/features/agents/agents-table'
import { BootContext } from '@/hooks/use-boot'
import { parseBoot } from '@/lib/boot'
import { agentNamed, agentWith, cellOf, rowOf } from '@/test/agents-api'

function show(agents: Agent[]) {
    return render(
        <BootContext.Provider value={parseBoot({ timezone: 'UTC' })}>
            <MemoryRouter>
                <AgentsTable
                    agents={agents}
                    range="24h"
                    sort="-runs"
                    caption="Agents"
                />
            </MemoryRouter>
        </BootContext.Provider>,
    )
}

const pathOf = (name: string) =>
    cellOf(rowOf(name), 'Activity').querySelector('path')?.getAttribute('d')

describe('the trend of an agent', () => {
    it('is drawn from zero, so a ripple on a high count is not a mountain', () => {
        const quiet = agentWith('SupportAssistant', {
            name: 'Quiet',
            activity: [3, 4, 3, 4],
        })

        show([
            quiet,
            agentWith('ResearchAgent', { activity: [30, 40, 30, 40] }),
        ])

        // From the lowest value the two rows would be identical, whole-box zigzags.
        expect(pathOf('Quiet')).toBe(sparklinePath([3, 4, 3, 4], 'zero'))
        expect(pathOf('Quiet')).not.toBe(sparklinePath([3, 4, 3, 4]))
        // Each row has its own scale (its own busiest bucket): the two are the same shape.
        expect(pathOf('ResearchAgent')).toBe(
            sparklinePath([30, 40, 30, 40], 'zero'),
        )
    })

    it('draws a row with no bucket above zero as nothing, and still says its runs', () => {
        show([
            agentWith('SupportAssistant', {
                activity: [0, 0, 0, 0],
            }),
            agentNamed('ResearchAgent'),
        ])

        const cell = cellOf(rowOf('SupportAssistant'), 'Activity')

        expect(cell.querySelector('svg')).toBeNull()
        expect(
            within(cell).getByText('23 runs in the last 24 hours'),
        ).toBeInTheDocument()
        expect(
            cellOf(rowOf('ResearchAgent'), 'Activity').querySelector('svg'),
        ).not.toBeNull()
    })

    it('says on the header that every row has its own scale, without changing its name', () => {
        show([agentNamed('SupportAssistant')])

        const head = screen.getByRole('columnheader', { name: 'Activity' })

        expect(head).toHaveTextContent(/^Activity$/)
        expect(head.querySelector('[title]')).toHaveAttribute(
            'title',
            'Each row is drawn on its own scale, from zero. Trends are not comparable between rows.',
        )
    })
})

describe('the agent column', () => {
    it('takes the width the other columns leave, which only the room cuts', () => {
        show([agentNamed('SupportAssistant')])

        // A test DOM has no layout: these are the classes that give the column the free width.
        const head = screen.getByRole('columnheader', { name: 'Agent' })
        const cell = cellOf(rowOf('SupportAssistant'), 'Agent')

        for (const element of [head, cell]) {
            expect(element).toHaveClass('w-full', 'max-w-0')
        }

        for (const column of ['Runs', 'Error rate']) {
            expect(cellOf(rowOf('SupportAssistant'), column)).not.toHaveClass(
                'w-full',
            )
        }
    })

    it('has no width of its own in the cell, so it is never cut before the room is used', () => {
        show([agentNamed('SupportAssistant')])

        const cell = cellOf(rowOf('SupportAssistant'), 'Agent')

        expect(cell.firstElementChild?.className).not.toMatch(/max-w-\d/)
    })
})
