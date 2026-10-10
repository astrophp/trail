import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appReady, renderApp } from '@/test/render-app'
import {
    makeAgentSpan,
    makeDetail,
    makeStepSpan,
    mockTraceApi,
} from '@/test/trace-api'

// Every render of the tree calls the component, so the calls count the times it rendered.
vi.mock('@/features/trace/span-tree', async (original) => {
    const actual = await original<typeof import('@/features/trace/span-tree')>()

    return { ...actual, SpanTree: vi.fn(actual.SpanTree) }
})

const { SpanTree } = await import('@/features/trace/span-tree')

const id = '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30'

beforeEach(() => {
    window.Trail = {
        path: '/trail',
        apiPath: '/trail/api',
        csrfToken: 'csrf-1',
    }
})

afterEach(() => {
    delete window.Trail
})

describe('the execution pane', () => {
    it('does not render the tree again when the evidence tab changes', async () => {
        mockTraceApi({
            [id]: makeDetail({
                trace: { id },
                spans: [
                    makeAgentSpan('root', {
                        sequence: 1,
                        input: { prompt: 'Hi' },
                        output: { text: 'Yo' },
                    }),
                    makeStepSpan('s1', {
                        sequence: 2,
                        parent_id: 'root',
                        step_number: 0,
                    }),
                ],
            }),
        })
        renderApp(`/traces/${id}`)
        await appReady()
        await screen.findByRole('tree', { name: 'Execution tree' })

        const rendered = vi.mocked(SpanTree).mock.calls.length

        await userEvent.click(screen.getByRole('tab', { name: 'Output' }))

        expect(screen.getByRole('tab', { name: 'Output' })).toHaveAttribute(
            'aria-selected',
            'true',
        )
        expect(window.location.search).toBe('?tab=output')
        expect(vi.mocked(SpanTree).mock.calls.length - rendered).toBe(0)
    })
})
