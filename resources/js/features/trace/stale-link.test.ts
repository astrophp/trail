import { describe, expect, it } from 'vitest'
import { buildSpanTree } from '@/features/trace/build-span-tree'
import { staleLink, staleLinkText } from '@/features/trace/stale-link'
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

describe('staleLink', () => {
    it('is null for a link that names nothing, or names what the run has', () => {
        expect(staleLink(tree, 'completed', '', '')).toBeNull()
        expect(staleLink(tree, 'completed', 's1', '')).toBeNull()
        expect(staleLink(tree, 'completed', 's1', 'raw')).toBeNull()
    })

    it('finds a span the run does not have, and clears the span and the tab with it', () => {
        expect(staleLink(tree, 'completed', 'gone', 'raw')).toEqual({
            kind: 'span',
            patch: { span: '', tab: '' },
        })
    })

    it('finds a tab the span does not have, and says which tab shows instead', () => {
        expect(staleLink(tree, 'completed', 't1', 'output')).toEqual({
            kind: 'tab',
            patch: { tab: '' },
            shown: 'input',
        })
    })

    it('checks a tab with no span named against the span that is selected', () => {
        // The root has no input to show: its first tab is Metadata.
        expect(staleLink(tree, 'completed', '', 'input')).toEqual({
            kind: 'tab',
            patch: { tab: '' },
            shown: 'metadata',
        })
        expect(staleLink(tree, 'completed', '', 'metadata')).toBeNull()
    })
})

describe('staleLinkText', () => {
    it('says what happened and what shows instead', () => {
        expect(
            staleLinkText(
                { kind: 'span', patch: { span: '', tab: '' } },
                false,
            ),
        ).toBe(
            'The span this link pointed to is not in this run. Showing the default selection.',
        )
        expect(
            staleLinkText(
                { kind: 'tab', patch: { tab: '' }, shown: 'raw' },
                true,
            ),
        ).toBe('That tab is not available for this span. Showing Raw.')
    })

    it('adds that a run cut at the limit may not have shown the span', () => {
        expect(
            staleLinkText({ kind: 'span', patch: { span: '', tab: '' } }, true),
        ).toMatch(/ It may be beyond the spans shown\.$/)
    })
})
