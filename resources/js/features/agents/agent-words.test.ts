import { describe, expect, it } from 'vitest'
import { agentRole, agentTitle } from '@/features/agents/agent-words'
import {
    callsText,
    cutText,
    runsText,
    shareOf,
} from '@/features/agents/breakdown-words'
import { agentNamed } from '@/test/agents-api'

describe('agentRole', () => {
    it('says how an agent runs from the runs of its own and the times it was delegated to', () => {
        const own = agentNamed('SupportAssistant')
        const both = agentNamed('ResearchAgent')
        const subOnly = agentNamed('Summarizer')
        const nothing = {
            ...own,
            top_level: null,
            delegated: null,
        }

        expect(own.top_level).not.toBeNull()
        expect(own.delegated).toBeNull()
        expect(agentRole(own)).toBe('Runs on its own')
        expect(agentRole(both)).toBe('Runs on its own and as a sub-agent')
        expect(agentRole(subOnly)).toBe('Runs only as a sub-agent')
        expect(agentRole(nothing)).toBeNull()
    })

    it('calls an embeddings agent that, whatever else it did', () => {
        const embeddings = agentNamed('Embeddings')

        expect(embeddings.type).toBe('embedding')
        expect(agentRole(embeddings)).toBe('Embeddings')
        expect(
            agentRole({ ...embeddings, delegated: embeddings.delegated }),
        ).toBe('Embeddings')
    })
})

describe('agentTitle', () => {
    it('is the name as it is, spaces included', () => {
        expect(agentTitle(' a/b ')).toBe(' a/b ')
    })

    it('is a name to call a nameless agent by', () => {
        expect(agentTitle('')).toBe('Unnamed agent')
        expect(agentTitle('   ')).toBe('Unnamed agent')
    })
})

describe('the words of the breakdown', () => {
    it('counts runs and calls in the singular for one, with separators', () => {
        expect(runsText(1)).toBe('1 run')
        expect(runsText(0)).toBe('0 runs')
        expect(runsText(1234)).toBe('1,234 runs')
        expect(callsText(1)).toBe('1 call')
        expect(callsText(41)).toBe('41 calls')
    })

    it('says how many of how many a cut list shows, and nothing for one that is whole', () => {
        expect(cutText({ limit: 20, total: 35 })).toBe(
            'Showing the first 20 of 35',
        )
        expect(cutText({ limit: 20, total: 20 })).toBeNull()
        expect(cutText({ limit: 20, total: 0 })).toBeNull()
    })
})

describe('shareOf', () => {
    it('is the runs of the row over the runs there are', () => {
        expect(shareOf(5, 20)).toBe(0.25)
        expect(shareOf(20, 20)).toBe(1)
        expect(shareOf(0, 20)).toBe(0)
    })

    it('is clamped to the whole', () => {
        expect(shareOf(30, 20)).toBe(1)
    })

    it('is nothing, not zero, when there is no total to take a part of', () => {
        expect(shareOf(5, null)).toBeNull()
        expect(shareOf(5, 0)).toBeNull()
    })
})
