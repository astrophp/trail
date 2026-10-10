import { describe, expect, it } from 'vitest'
import {
    agentInput,
    agentOutput,
    embeddingInput,
    embeddingOutput,
    stepInput,
    stepOutput,
    toolInput,
    toolOutput,
    type Shape,
} from '@/components/telemetry/payload-shape'

const kind = (shape: Shape<unknown>) => shape.kind

describe('agent input', () => {
    it('is typed with a prompt, a system prompt or attachments', () => {
        expect(kind(agentInput({ prompt: 'Hi' }))).toBe('typed')
        expect(kind(agentInput({ system: 'S', prompt: null }))).toBe('typed')
        expect(kind(agentInput({ attachments: [{ name: 'a' }] }))).toBe('typed')
    })

    it('is nothing when the prompt is empty and nothing else is stored', () => {
        expect(kind(agentInput(null))).toBe('none')
        expect(kind(agentInput({ prompt: '', system: null }))).toBe('none')
        expect(kind(agentInput({}))).toBe('none')
    })

    it('is shown whole for another shape or an unexpected key', () => {
        expect(kind(agentInput({ prompt: 42 }))).toBe('whole')
        expect(kind(agentInput('plain text'))).toBe('whole')
        expect(kind(agentInput({ prompt: '', extra: 1 }))).toBe('whole')
    })
})

describe('step input', () => {
    it('is typed with messages or an option that is set', () => {
        expect(kind(stepInput({ messages: [{ role: 'user' }] }))).toBe('typed')
        expect(kind(stepInput({ messages: [], options: { max: 5 } }))).toBe(
            'typed',
        )
    })

    it('is nothing for empty messages and options that are all null', () => {
        expect(kind(stepInput({ messages: null, options: null }))).toBe('none')
        expect(
            kind(
                stepInput({
                    messages: [],
                    messages_offset: 0,
                    options: { max_tokens: null },
                }),
            ),
        ).toBe('none')
    })

    it('is shown whole for messages that are not a list, and for an unexpected key', () => {
        expect(kind(stepInput({ messages: 'x' }))).toBe('whole')
        expect(kind(stepInput({ messages: [], extra: 'y' }))).toBe('whole')
    })
})

describe('tool input and output', () => {
    it('is typed when the arguments or the result are present and not null', () => {
        expect(kind(toolInput({ arguments: {} }))).toBe('typed')
        expect(kind(toolOutput({ result: 'ok' }))).toBe('typed')
        expect(kind(toolOutput({ result: false }))).toBe('typed')
    })

    it('is nothing when they are absent or null', () => {
        expect(kind(toolInput({ arguments: null }))).toBe('none')
        expect(kind(toolOutput({ result: null }))).toBe('none')
        expect(kind(toolOutput({}))).toBe('none')
        expect(kind(toolOutput(null))).toBe('none')
    })

    it('shows an object with other keys whole', () => {
        expect(kind(toolOutput({ value: 1 }))).toBe('whole')
        expect(kind(toolInput([1]))).toBe('whole')
    })
})

describe('embedding input and output', () => {
    it('is typed with a count or dimensions', () => {
        expect(kind(embeddingInput({ count: 2, dimensions: null }))).toBe(
            'typed',
        )
        expect(kind(embeddingInput({ dimensions: 256 }))).toBe('typed')
        expect(kind(embeddingOutput({ count: 2 }))).toBe('typed')
    })

    it('is nothing without them', () => {
        expect(kind(embeddingInput({ count: null, dimensions: null }))).toBe(
            'none',
        )
        expect(kind(embeddingOutput({ count: null }))).toBe('none')
    })

    it('is shown whole when they are not numbers', () => {
        expect(kind(embeddingInput({ count: 'two' }))).toBe('whole')
        expect(kind(embeddingOutput({ vectors: [[0.1]] }))).toBe('whole')
    })
})

describe('agent and step output', () => {
    it('is typed with a response or structured output, or text, calls, a finish reason or structured output', () => {
        expect(kind(agentOutput({ text: 'Yo' }))).toBe('typed')
        expect(kind(agentOutput({ text: '', structured: { a: 1 } }))).toBe(
            'typed',
        )
        expect(kind(stepOutput({ text: 'x' }))).toBe('typed')
        expect(kind(stepOutput({ tool_calls: [{ name: 'a' }] }))).toBe('typed')
        expect(kind(stepOutput({ finish_reason: 'stop' }))).toBe('typed')
        expect(kind(stepOutput({ structured: { a: 1 } }))).toBe('typed')
    })

    it('is nothing when all of it is empty', () => {
        expect(kind(agentOutput({ text: '', structured: null }))).toBe('none')
        expect(
            kind(stepOutput({ text: '', tool_calls: [], finish_reason: null })),
        ).toBe('none')
    })

    it('is shown whole for another shape', () => {
        expect(kind(agentOutput({ text: 5 }))).toBe('whole')
        expect(kind(stepOutput({ tool_calls: 'x' }))).toBe('whole')
        expect(kind(stepOutput({ other: 'x' }))).toBe('whole')
    })
})
