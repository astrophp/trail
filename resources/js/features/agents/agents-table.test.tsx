import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { AgentSort } from '@/api/agents'
import type { Agent, AgentTopLevel } from '@/api/types'
import { AgentsTable } from '@/features/agents/agents-table'
import { BootContext } from '@/hooks/use-boot'
import { parseBoot } from '@/lib/boot'
import type { TimeRangePreset } from '@/lib/time-range'
import { agentNamed, agentWith, cellOf, rowOf } from '@/test/agents-api'

const boot = parseBoot({ timezone: 'UTC' })

function show(
    agents: Agent[],
    props: {
        range?: TimeRangePreset
        from?: string
        onSortChange?: (sort: AgentSort) => void
    } = {},
): ReactElement {
    return (
        <BootContext.Provider value={boot}>
            <MemoryRouter>
                <AgentsTable
                    agents={agents}
                    range={props.range ?? '24h'}
                    from={props.from}
                    sort="-runs"
                    caption="Agents"
                    onSortChange={props.onSortChange}
                />
            </MemoryRouter>
        </BootContext.Provider>
    )
}

const text = (row: HTMLElement, column: string) =>
    cellOf(row, column).textContent

/** An agent's own figures with some replaced. */
function own(name: string, patch: Partial<AgentTopLevel>): Agent {
    const agent = agentNamed(name)

    if (agent.top_level === null) {
        throw new Error(`${name} has no runs of its own.`)
    }

    return agentWith(name, { top_level: { ...agent.top_level, ...patch } })
}

describe('a row of an agent with runs of its own', () => {
    it('has each figure in its own cell, in the columns of the table', () => {
        render(show([agentNamed('SupportAssistant')]))

        const row = rowOf('SupportAssistant')

        expect(
            within(screen.getByRole('table'))
                .getAllByRole('columnheader')
                .map((head) => head.textContent),
        ).toEqual([
            'Agent',
            'Runs',
            'Error rate',
            'Avg duration',
            'Est. cost',
            'Last activity',
            'Activity',
        ])
        expect(text(row, 'Runs')).toBe('23')
        expect(text(row, 'Error rate')).toBe('4.5%1 failed')
        expect(text(row, 'Avg duration')).toBe('1.09s')
        expect(text(row, 'Est. cost')).toMatch(/^\$0\.0283So far/)
        expect(
            cellOf(row, 'Last activity')
                .querySelector('time')
                ?.getAttribute('datetime'),
        ).toBe('2026-01-02T12:10:00.000Z')
    })

    it('names the agent with a link, and under it the class in full on hover', () => {
        render(show([agentNamed('SupportAssistant')]))

        const cell = cellOf(rowOf('SupportAssistant'), 'Agent')
        const line = within(cell).getByText('App\\Ai\\Agents\\SupportAssistant')

        expect(
            within(cell).getByRole('link', { name: 'SupportAssistant' }),
        ).toBeVisible()
        expect(line).toHaveAttribute(
            'title',
            'App\\Ai\\Agents\\SupportAssistant',
        )
    })

    it('has no second line for an agent without a class, and one for an agent that has it', () => {
        render(show([agentNamed('SupportAssistant'), agentNamed('Summarizer')]))

        expect(
            cellOf(rowOf('SupportAssistant'), 'Agent').querySelectorAll('p'),
        ).toHaveLength(1)
        expect(
            cellOf(rowOf('Summarizer'), 'Agent').querySelectorAll('p'),
        ).toHaveLength(0)
    })

    it('marks a run of embeddings in words, beside its class when it has one', () => {
        render(
            show([
                agentNamed('Embeddings'),
                agentWith('SupportAssistant', {
                    name: 'Vectors',
                    type: 'embedding',
                }),
                agentNamed('ResearchAgent'),
            ]),
        )

        expect(cellOf(rowOf('Embeddings'), 'Agent')).toHaveTextContent(
            /^Embeddings\s*Embeddings$/,
        )
        expect(cellOf(rowOf('Vectors'), 'Agent')).toHaveTextContent(
            /Embeddings\s*App\\Ai\\Agents\\SupportAssistant$/,
        )
        expect(
            within(cellOf(rowOf('ResearchAgent'), 'Agent')).queryByText(
                'Embeddings',
            ),
        ).not.toBeInTheDocument()
        expect(
            within(cellOf(rowOf('Embeddings'), 'Agent')).getByRole('img', {
                name: 'Embedding run',
            }),
        ).toBeVisible()
    })
})

describe('the delegated line of the runs cell', () => {
    it('is a figure of its own, in the singular for one', () => {
        render(show([agentNamed('ResearchAgent')]))

        const cell = cellOf(rowOf('ResearchAgent'), 'Runs')

        // The agent made 1 run of its own and was delegated to once: the two are not added.
        const lines = [...(cell.firstElementChild?.children ?? [])]

        expect(lines.map((line) => line.textContent)).toEqual([
            '1',
            '1 delegated run',
        ])
    })

    it('is in the plural for any other count, with the separators of a count', () => {
        render(
            show([
                agentWith('ResearchAgent', {
                    delegated: {
                        all: 1234,
                        failed: 0,
                        incomplete: 0,
                        last_activity_at: '2026-01-02T11:00:01.100Z',
                    },
                }),
            ]),
        )

        expect(
            [
                ...(cellOf(rowOf('ResearchAgent'), 'Runs').firstElementChild
                    ?.children ?? []),
            ].map((line) => line.textContent),
        ).toEqual(['1', '1,234 delegated runs'])
    })

    it('is absent when the agent was never delegated to', () => {
        render(show([agentNamed('SupportAssistant')]))

        expect(cellOf(rowOf('SupportAssistant'), 'Runs').textContent).toBe('23')
        expect(
            within(rowOf('SupportAssistant')).queryByText(/delegated/),
        ).not.toBeInTheDocument()
    })
})

describe('a row of an agent seen only as a sub-agent', () => {
    it('says so with its delegated count, and has no figure in the other cells', () => {
        render(show([agentNamed('SupportAssistant'), agentNamed('Summarizer')]))

        const row = rowOf('Summarizer')
        const normal = rowOf('SupportAssistant')

        expect(text(row, 'Runs')).toBe('Sub-agent only2 delegated runs')

        for (const column of [
            'Error rate',
            'Avg duration',
            'Est. cost',
            'Activity',
        ]) {
            // Present for the agent with runs of its own, absent for this one.
            expect(text(normal, column)).not.toBe('')
            expect(text(normal, column)).not.toBe('Does not apply')
            // Only a word for a screen reader: no digit, no "0", "Not captured" or "No ...".
            expect(text(row, column)).toBe('Does not apply')
            expect(cellOf(row, column).querySelector('.sr-only')).not.toBeNull()
            expect(
                cellOf(row, column).querySelector('.sr-only'),
            ).toHaveTextContent('Does not apply')
        }
    })

    it('still says when it was last active, which the API gives for the agent', () => {
        render(show([agentNamed('Summarizer')]))

        expect(
            cellOf(rowOf('Summarizer'), 'Last activity')
                .querySelector('time')
                ?.getAttribute('datetime'),
        ).toBe('2026-01-02T11:00:02.600Z')
    })

    it('has no trend, while an agent with runs of its own does', () => {
        render(show([agentNamed('SupportAssistant'), agentNamed('Summarizer')]))

        expect(
            cellOf(rowOf('SupportAssistant'), 'Activity').querySelector(
                '[data-slot="sparkline"] svg',
            ),
        ).not.toBeNull()
        expect(
            cellOf(rowOf('Summarizer'), 'Activity').querySelector(
                '[data-slot="sparkline"]',
            ),
        ).toBeNull()
    })
})

describe('the error rate cell', () => {
    it('reads No finished runs for a null rate and 0.0% for a real zero', () => {
        render(
            show([
                own('SupportAssistant', {
                    error_rate: { rate: null, failed: 0, finished: 0 },
                }),
                agentNamed('ResearchAgent'),
            ]),
        )

        expect(text(rowOf('SupportAssistant'), 'Error rate')).toBe(
            'No finished runs',
        )
        expect(text(rowOf('ResearchAgent'), 'Error rate')).toBe('0.0%')
    })

    it('counts what failed under the rate, and only when something did', () => {
        render(
            show([agentNamed('SupportAssistant'), agentNamed('ResearchAgent')]),
        )

        expect(
            within(cellOf(rowOf('SupportAssistant'), 'Error rate')).getByText(
                '1 failed',
            ),
        ).toBeVisible()
        expect(
            within(cellOf(rowOf('ResearchAgent'), 'Error rate')).queryByText(
                /failed/,
            ),
        ).not.toBeInTheDocument()
    })

    it('never calls an incomplete run failed', () => {
        render(
            show([
                own('ResearchAgent', {
                    runs: {
                        all: 5,
                        completed: 2,
                        failed: 0,
                        incomplete: 3,
                        running: 0,
                        awaiting_approval: 0,
                    },
                    error_rate: { rate: 0, failed: 0, finished: 5 },
                }),
            ]),
        )

        expect(text(rowOf('ResearchAgent'), 'Error rate')).toBe('0.0%')
        expect(
            within(rowOf('ResearchAgent')).queryByText(/incomplete|failed/),
        ).not.toBeInTheDocument()
    })
})

describe('the duration cell', () => {
    it('is an average without a status, and says when nothing was measured', () => {
        render(
            show([
                agentNamed('ResearchAgent'),
                own('SupportAssistant', {
                    duration: {
                        average_ms: null,
                        measured: 0,
                        not_measured: 23,
                    },
                }),
            ]),
        )

        expect(text(rowOf('ResearchAgent'), 'Avg duration')).toBe('900 ms')
        expect(text(rowOf('SupportAssistant'), 'Avg duration')).toBe(
            'No measured runs',
        )
    })

    it('says average in its header, and nothing about a percentile', () => {
        render(show([agentNamed('ResearchAgent')]))

        const table = screen.getByRole('table')

        expect(
            within(table).getByRole('columnheader', { name: 'Avg duration' }),
        ).toBeVisible()
        expect(table).not.toHaveTextContent(/p95|latency/i)
    })
})

describe('the cost cell', () => {
    const cost = (state: string, amount: number | null) =>
        ({ state, amount }) as AgentTopLevel['cost']

    it.each([
        // An estimate stands alone; a partial one says it covers only what was priced; an amount
        // so far says it can still grow.
        ['estimated', cost('estimated', 0.004), /^\$0\.0040$/],
        ['partial', cost('partial', 0.0123), /^\$0\.0123Partial/],
        ['pending with an amount', cost('pending', 0.5), /^\$0\.5000So far/],
    ])('shows the amount of a %s cost as it is', (_, value, expected) => {
        render(
            show([
                own('ResearchAgent', { cost: value }),
                agentNamed('Embeddings'),
            ]),
        )

        expect(text(rowOf('ResearchAgent'), 'Est. cost')).toMatch(expected)
        // The embedding agent's estimate has no tag, and a tiny amount is shown as such.
        expect(text(rowOf('Embeddings'), 'Est. cost')).toBe('<$0.0001')
    })

    it.each([
        ['pending without an amount', cost('pending', null), 'Pending'],
        ['unpriced', cost('unpriced', null), 'Unpriced'],
        ['not captured', cost('not_captured', null), 'Not captured'],
    ])('reads %s in words, never as an amount', (_, value, words) => {
        render(show([own('ResearchAgent', { cost: value })]))

        expect(text(rowOf('ResearchAgent'), 'Est. cost')).toBe(words)
    })
})

describe('the trend', () => {
    it('says how many runs the agent made in the range, from the count the API gave', () => {
        render(show([agentNamed('SupportAssistant')]))

        // The buckets of the fixture add up to something else: the words use `runs.all`.
        expect(
            within(cellOf(rowOf('SupportAssistant'), 'Activity')).getByText(
                '23 runs in the last 24 hours',
            ),
        ).toBeInTheDocument()
    })

    it('is in the singular for one run, and names the range it was counted over', () => {
        render(show([agentNamed('ResearchAgent')], { range: '7d' }))

        expect(
            within(cellOf(rowOf('ResearchAgent'), 'Activity')).getByText(
                '1 run in the last 7 days',
            ),
        ).toBeInTheDocument()
    })

    it.each([
        ['1h', 'the last hour'],
        ['24h', 'the last 24 hours'],
        ['7d', 'the last 7 days'],
    ] as const)('says %s as "%s"', (range, words) => {
        render(show([agentNamed('SupportAssistant')], { range }))

        expect(
            within(cellOf(rowOf('SupportAssistant'), 'Activity')).getByText(
                `23 runs in ${words}`,
            ),
        ).toBeInTheDocument()
    })
})

describe('the link of the agent', () => {
    const href = (name: string) =>
        screen.getByRole('link', { name }).getAttribute('href')

    it('leads to the agent’s page with the name in the query', () => {
        render(show([agentNamed('SupportAssistant')]))

        expect(href('SupportAssistant')).toBe(
            '/agents/agent?name=SupportAssistant',
        )
    })

    it.each([
        ['a/b', 'name=a%2Fb'],
        ['two words', 'name=two%20words'],
        ['100%', 'name=100%25'],
        ['c++', 'name=c%2B%2B'],
        ['a/b c%d+e', 'name=a%2Fb%20c%25d%2Be'],
    ])('encodes %s so it reads back as it was', (name, query) => {
        render(show([agentWith('SupportAssistant', { name })]))

        const target = href(name) ?? ''

        expect(target).toBe(`/agents/agent?${query}`)
        expect(new URLSearchParams(target.split('?')[1]).get('name')).toBe(name)
    })

    it('carries a range that is not the default, and the list it was opened from', () => {
        const from = '/agents?range=7d&sort=-cost&search=a b'

        render(show([agentNamed('SupportAssistant')], { range: '7d', from }))

        const target = href('SupportAssistant') ?? ''
        const query = new URLSearchParams(target.split('?')[1])

        expect(target.startsWith('/agents/agent?name=SupportAssistant&')).toBe(
            true,
        )
        expect(query.get('range')).toBe('7d')
        expect(query.get('from')).toBe(from)
        expect(target).toContain('&range=7d&from=%2Fagents%3Frange%3D7d')
    })

    it('leaves the default range out, and has no return target without a list', () => {
        render(show([agentNamed('SupportAssistant')], { range: '24h' }))

        expect(href('SupportAssistant')).not.toContain('range')
        expect(href('SupportAssistant')).not.toContain('from')
    })

    it('is the row’s link: the only link of the row', () => {
        render(show([agentNamed('SupportAssistant')]))

        expect(
            within(rowOf('SupportAssistant')).getAllByRole('link'),
        ).toHaveLength(1)
    })
})

describe('sorting', () => {
    it('makes the six columns of the API sortable, and not the trend', () => {
        render(
            show([agentNamed('SupportAssistant')], { onSortChange: () => {} }),
        )

        expect(
            screen
                .getAllByRole('columnheader')
                .filter((head) => head.hasAttribute('aria-sort'))
                .map((head) => head.textContent),
        ).toEqual([
            'Agent',
            'Runs',
            'Error rate',
            'Avg duration',
            'Est. cost',
            'Last activity',
        ])
    })

    it.each([
        ['Agent', 'name'],
        ['Runs', '-runs'],
        ['Error rate', '-error_rate'],
        ['Avg duration', '-duration'],
        ['Est. cost', '-cost'],
        ['Last activity', '-last_activity'],
    ])('asks for %s as %s on its first click', async (name, sort) => {
        const onSort = vi.fn()

        render(show([agentNamed('SupportAssistant')], { onSortChange: onSort }))

        // The list is sorted by runs, so the first click on it flips it.
        await userEvent.click(
            within(screen.getByRole('columnheader', { name })).getByRole(
                'button',
            ),
        )

        expect(onSort).toHaveBeenCalledWith(name === 'Runs' ? 'runs' : sort)
    })

    it('has no sort buttons without a handler, whatever the order', () => {
        render(show([agentNamed('SupportAssistant')]))

        expect(screen.queryByRole('button')).not.toBeInTheDocument()
        expect(
            screen
                .getAllByRole('columnheader')
                .some((head) => head.hasAttribute('aria-sort')),
        ).toBe(false)
    })
})
