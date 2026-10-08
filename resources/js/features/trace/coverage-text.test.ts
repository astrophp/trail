import { describe, expect, it } from 'vitest'
import type { Coverage, CoverageItem, CoverageReason } from '@/api/types'
import {
    coverageItems,
    coverageReason,
    coverageSentence,
} from '@/features/trace/coverage-text'

const item = (
    state: CoverageItem['state'],
    captured: number,
    expected: number,
    reason: CoverageReason | null = null,
): CoverageItem => ({ state, captured, expected, reason })

describe('coverageSentence', () => {
    it('says what was captured, with the counts as given', () => {
        expect(coverageSentence('timing', item('captured', 4, 4))).toBe(
            'Captured (4 of 4)',
        )
        expect(coverageSentence('usage', item('captured', 1200, 1200))).toBe(
            'Captured (1,200 of 1,200)',
        )
    })

    it('says a partial gap with its reason', () => {
        expect(
            coverageSentence('timing', item('partial', 2, 4, 'unfinished')),
        ).toBe('Partly captured (2 of 4): the spans without it never finished')
    })

    it('says nothing was captured with zero of the expected', () => {
        expect(
            coverageSentence(
                'usage',
                item('not_captured', 0, 3, 'not_reported'),
            ),
        ).toBe('Not captured (0 of 3): not reported by the SDK or provider')
    })

    it('says an item does not apply, without counts', () => {
        expect(
            coverageSentence('responding_model', item('not_applicable', 0, 0)),
        ).toBe('Not applicable to this run')
    })

    it('shows a state it does not know as received', () => {
        expect(
            coverageSentence('cost', {
                state: 'degraded',
                captured: 2,
                expected: 5,
                reason: null,
            } as unknown as CoverageItem),
        ).toBe('Reported as degraded (2 of 5)')
    })

    it('does not append a reason it does not know', () => {
        expect(
            coverageSentence('cost', {
                state: 'partial',
                captured: 1,
                expected: 2,
                reason: 'something_new',
            } as unknown as CoverageItem),
        ).toBe('Partly captured (1 of 2)')
    })

    it('uses the counts as given for nothing captured', () => {
        expect(
            coverageSentence('usage', item('not_captured', 1, 3, null)),
        ).toBe('Not captured (1 of 3)')
    })

    it('leaves the reason out when there is none', () => {
        expect(coverageSentence('cost', item('partial', 1, 2))).toBe(
            'Partly captured (1 of 2)',
        )
    })
})

describe('coverageReason', () => {
    it.each([
        ['timing', 'unfinished', 'the spans without it never finished'],
        ['usage', 'not_reported', 'not reported by the SDK or provider'],
        [
            'responding_model',
            'streamed',
            'streamed runs do not report the responding model',
        ],
        ['cost', 'no_price', 'no price is configured for a model'],
        ['system_prompt', 'not_stored', 'no system prompt was stored'],
        [
            'payloads',
            'not_stored',
            'payloads were not stored; payload capture may be switched off (trail.capture.enabled)',
        ],
    ] as [keyof Coverage, CoverageReason, string][])(
        'words %s / %s',
        (key, reason, words) => {
            expect(coverageReason(key, reason)).toBe(words)
        },
    )
})

describe('coverageItems', () => {
    it('lists the six items in the page order', () => {
        expect(coverageItems.map((entry) => entry.label)).toEqual([
            'Timing',
            'Responding model',
            'Usage',
            'Cost',
            'System prompt',
            'Payloads',
        ])
    })
})
