import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useMemo, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { AgentSubtotal, Span } from '@/api/types'
import { buildSpanTree } from '@/features/trace/build-span-tree'
import { SpanTree } from '@/features/trace/span-tree'
import { useTreeView } from '@/features/trace/use-tree-view'
import { makeAgentSpan, makeStepSpan, makeToolSpan } from '@/test/trace-api'

// Every render of a row asks for its title, so the calls count the rows that rendered.
vi.mock('@/features/trace/span-title', async (original) => {
    const actual =
        await original<typeof import('@/features/trace/span-title')>()

    return { ...actual, spanTitle: vi.fn(actual.spanTitle) }
})

const { spanTitle } = await import('@/features/trace/span-title')

const spanCount = 2000

/** An agent with a model step and a tool call per turn, until there are `spanCount` spans. */
function bigRun(): Span[] {
    const spans: Span[] = [makeAgentSpan('root', { sequence: 0 })]

    for (let turn = 0; spans.length < spanCount; turn++) {
        spans.push(
            makeStepSpan(`s${turn}`, {
                sequence: spans.length,
                parent_id: 'root',
                step_number: turn,
            }),
        )

        if (spans.length < spanCount) {
            spans.push(
                makeToolSpan(`t${turn}`, {
                    sequence: spans.length,
                    parent_id: 'root',
                }),
            )
        }
    }

    return spans
}

const spans = bigRun()

function Run() {
    const tree = useMemo(() => buildSpanTree(spans), [])
    const agents = useMemo(() => new Map<string, AgentSubtotal>(), [])
    const [selected, setSelected] = useState('root')
    const view = useTreeView(tree, selected)

    return (
        <SpanTree
            tree={tree}
            view={view}
            selectedId={selected}
            onSelect={setSelected}
            agents={agents}
            axisMs={null}
        />
    )
}

describe('a run of 2,000 spans', () => {
    it('renders every row, and changing the selection re-renders only the two rows it touches', async () => {
        render(<Run />)

        expect(screen.getAllByRole('treeitem')).toHaveLength(spanCount)

        // Only the rows that render again call `spanTitle` from here on.
        const rendered = vi.mocked(spanTitle).mock.calls.length
        const target = screen.getAllByRole('treeitem')[1000]
        await userEvent.click(target)

        expect(target).toHaveAttribute('aria-selected', 'true')
        expect(vi.mocked(spanTitle).mock.calls.length - rendered).toBe(2)
        // Rendering 2,000 rows in jsdom takes a few seconds on a busy machine, longer than the
        // default timeout; the count asserted above does not depend on how long it takes.
    }, 60_000)
})
