import { describe, expect, it } from 'vitest'
import { buildSpanTree } from '@/features/trace/build-span-tree'
import { shownSelection } from '@/features/trace/shown-selection'
import { makeAgentSpan, makeStepSpan, makeToolSpan } from '@/test/trace-api'

const tree = buildSpanTree([
    makeAgentSpan('root', { sequence: 1 }),
    makeStepSpan('s1', { sequence: 2, parent_id: 'root', step_number: 0 }),
    makeToolSpan('t1', {
        sequence: 3,
        parent_id: 'root',
        input: { arguments: {} },
    }),
])

describe('shownSelection', () => {
    it('names the span and the tab that are on screen when the URL names none', () => {
        expect(
            shownSelection(tree, 'completed', {
                view: 'usage',
                span: '',
                tab: '',
            }),
        ).toEqual({
            selectedId: 'root',
            shown: { view: 'usage', span: 'root', tab: 'metadata' },
        })
    })

    it('keeps what the URL names when the run has it', () => {
        expect(
            shownSelection(tree, 'completed', {
                view: 'execution',
                span: 's1',
                tab: 'raw',
            }).shown,
        ).toEqual({ view: 'execution', span: 's1', tab: 'raw' })
    })

    it('shows the first tab for one the span does not have, and the default for a span the run does not have', () => {
        expect(
            shownSelection(tree, 'completed', {
                view: 'execution',
                span: 't1',
                tab: 'output',
            }).shown.tab,
        ).toBe('input')
        expect(
            shownSelection(tree, 'completed', {
                view: 'execution',
                span: 'gone',
                tab: '',
            }).selectedId,
        ).toBe('root')
    })

    it('has no span and no tab for a run without spans', () => {
        expect(
            shownSelection(buildSpanTree([]), 'completed', {
                view: 'execution',
                span: '',
                tab: 'raw',
            }),
        ).toEqual({
            selectedId: null,
            shown: { view: 'execution', span: '', tab: '' },
        })
    })
})
