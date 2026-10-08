import { describe, expect, it } from 'vitest'
import { activeTab, availableTabs } from '@/features/trace/evidence-tabs'

describe('availableTabs', () => {
    it('offers all four tabs for a span with input and output', () => {
        expect(
            availableTabs({
                type: 'tool',
                input: { arguments: 1 },
                output: { result: 'x' },
            }),
        ).toEqual(['input', 'output', 'metadata', 'raw'])
    })

    it('leaves out the tab of a payload that was not stored', () => {
        expect(
            availableTabs({
                type: 'tool',
                input: { arguments: 'x' },
                output: null,
            }),
        ).toEqual(['input', 'metadata', 'raw'])
        expect(
            availableTabs({
                type: 'tool',
                input: null,
                output: { result: 'x' },
            }),
        ).toEqual(['output', 'metadata', 'raw'])
    })

    it('always offers metadata and raw', () => {
        expect(
            availableTabs({ type: 'tool', input: null, output: null }),
        ).toEqual(['metadata', 'raw'])
    })

    it('shows something of an unexpected shape whole, so its tab exists', () => {
        const tabs = availableTabs({
            type: 'tool',
            input: '',
            output: { odd: 1 },
        })

        expect(tabs).toContain('input')
        expect(tabs).toContain('output')
    })

    it('has no tab for a payload with nothing in it', () => {
        expect(
            availableTabs({
                type: 'tool',
                input: {},
                output: { result: null },
            }),
        ).toEqual(['metadata', 'raw'])
        expect(
            availableTabs({
                type: 'step',
                input: { messages: null, options: null },
                output: { text: '', tool_calls: [], finish_reason: null },
            }),
        ).toEqual(['metadata', 'raw'])
    })
})

describe('activeTab', () => {
    const tabs = availableTabs({
        type: 'tool',
        input: null,
        output: { result: 'x' },
    })

    it('is the requested tab when the span has it', () => {
        expect(activeTab('raw', tabs)).toBe('raw')
    })

    it('is the first tab for an empty or unavailable request', () => {
        expect(activeTab('', tabs)).toBe('output')
        expect(activeTab('input', tabs)).toBe('output')
        expect(activeTab('nope', tabs)).toBe('output')
    })
})
