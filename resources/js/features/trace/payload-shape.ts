import type { Span } from '@/api/types'
import {
    asArray,
    asObject,
    isAbsent,
    isNumberOrAbsent,
    isTextOrAbsent,
} from '@/features/trace/payload-access'
import type { JsonObject, JsonValue } from '@/lib/json'

/**
 * What a stored input or output holds, for one span type: `typed` when it has the shape its type
 * stores and something in it to show, `whole` when it holds something of another shape (shown
 * as stored, so nothing is hidden), `none` when there is nothing to show. The tabs a span offers
 * and the panels that fill them both read these, so they cannot disagree.
 */
export type Shape<T> =
    { kind: 'none' } | { kind: 'whole' } | { kind: 'typed'; value: T }

const none = { kind: 'none' } as const
const whole = { kind: 'whole' } as const

/** Whether a value is anything but nothing: not null, and not an object whose values are all null. */
function holdsSomething(value: JsonValue | undefined): boolean {
    if (isAbsent(value)) {
        return false
    }

    const object = asObject(value)

    return (
        object === null || Object.values(object).some((item) => item !== null)
    )
}

/**
 * `typed` when the value has the type's shape (`read`) and `has` says there is something in it. A
 * value of that shape with nothing in it is `none`, unless it carries a key the type does not
 * know with something in it: then it is shown whole. A value of another shape is shown whole
 * when it holds anything.
 */
function shape<T>(
    stored: JsonValue | undefined,
    known: readonly string[],
    read: (object: JsonObject) => T | null,
    has: (value: T) => boolean,
): Shape<T> {
    const object = asObject(stored)
    const value = object === null ? null : read(object)

    if (object !== null && value !== null) {
        if (has(value)) {
            return { kind: 'typed', value }
        }

        return Object.entries(object).some(
            ([key, item]) => !known.includes(key) && item !== null,
        )
            ? whole
            : none
    }

    return holdsSomething(stored) ? whole : none
}

const nonEmpty = (value: string | null) => value !== null && value !== ''
const text = (value: JsonValue | undefined) =>
    typeof value === 'string' ? value : null

export type AgentInput = {
    system: string | null
    prompt: JsonValue | undefined
    attachments: JsonValue | undefined
}

export type StepInput = {
    messages: JsonValue[] | null
    offset: number
    options: JsonObject | null
}

export type ToolInput = { arguments: JsonValue }

export type EmbeddingInput = {
    count: number | null
    dimensions: number | null
}

export type AgentOutput = {
    text: string | null
    structured: JsonValue | undefined
}

export type StepOutput = {
    text: string | null
    calls: JsonValue[] | null
    reason: string | null
    structured: JsonValue | undefined
}

export type ToolOutput = { result: JsonValue }

export type EmbeddingOutput = { count: number | null }

export function agentInput(stored: JsonValue | undefined): Shape<AgentInput> {
    return shape(
        stored,
        ['prompt', 'system', 'attachments'],
        (object) =>
            isTextOrAbsent(object.prompt) && isTextOrAbsent(object.system)
                ? {
                      system: text(object.system),
                      prompt: object.prompt,
                      attachments: object.attachments,
                  }
                : null,
        (value) =>
            nonEmpty(value.system) ||
            nonEmpty(text(value.prompt)) ||
            !isAbsent(value.attachments),
    )
}

export function stepInput(stored: JsonValue | undefined): Shape<StepInput> {
    return shape(
        stored,
        ['messages', 'messages_offset', 'options'],
        (object) => {
            const options = asObject(object.options)

            return (isAbsent(object.messages) ||
                Array.isArray(object.messages)) &&
                isNumberOrAbsent(object.messages_offset) &&
                (isAbsent(object.options) || options !== null)
                ? {
                      messages: asArray(object.messages),
                      offset:
                          typeof object.messages_offset === 'number'
                              ? object.messages_offset
                              : 0,
                      options,
                  }
                : null
        },
        (value) =>
            (value.messages !== null && value.messages.length > 0) ||
            Object.values(value.options ?? {}).some((item) => item !== null),
    )
}

export function toolInput(stored: JsonValue | undefined): Shape<ToolInput> {
    return shape(
        stored,
        ['arguments'],
        (object) => ({ arguments: object.arguments }),
        (value) => !isAbsent(value.arguments),
    )
}

export function embeddingInput(
    stored: JsonValue | undefined,
): Shape<EmbeddingInput> {
    return shape(
        stored,
        ['count', 'dimensions'],
        (object) =>
            isNumberOrAbsent(object.count) &&
            isNumberOrAbsent(object.dimensions)
                ? {
                      count:
                          typeof object.count === 'number'
                              ? object.count
                              : null,
                      dimensions:
                          typeof object.dimensions === 'number'
                              ? object.dimensions
                              : null,
                  }
                : null,
        (value) => value.count !== null || value.dimensions !== null,
    )
}

export function agentOutput(stored: JsonValue | undefined): Shape<AgentOutput> {
    return shape(
        stored,
        ['text', 'structured'],
        (object) =>
            isTextOrAbsent(object.text)
                ? { text: text(object.text), structured: object.structured }
                : null,
        (value) => nonEmpty(value.text) || !isAbsent(value.structured),
    )
}

export function stepOutput(stored: JsonValue | undefined): Shape<StepOutput> {
    return shape(
        stored,
        ['text', 'tool_calls', 'finish_reason', 'structured'],
        (object) =>
            isTextOrAbsent(object.text) &&
            isTextOrAbsent(object.finish_reason) &&
            (isAbsent(object.tool_calls) || Array.isArray(object.tool_calls))
                ? {
                      text: text(object.text),
                      calls: asArray(object.tool_calls),
                      reason: text(object.finish_reason),
                      structured: object.structured,
                  }
                : null,
        (value) =>
            nonEmpty(value.text) ||
            (value.calls !== null && value.calls.length > 0) ||
            value.reason !== null ||
            !isAbsent(value.structured),
    )
}

export function toolOutput(stored: JsonValue | undefined): Shape<ToolOutput> {
    return shape(
        stored,
        ['result'],
        (object) => ({ result: object.result }),
        (value) => !isAbsent(value.result),
    )
}

export function embeddingOutput(
    stored: JsonValue | undefined,
): Shape<EmbeddingOutput> {
    return shape(
        stored,
        ['count'],
        (object) =>
            isNumberOrAbsent(object.count)
                ? {
                      count:
                          typeof object.count === 'number'
                              ? object.count
                              : null,
                  }
                : null,
        (value) => value.count !== null,
    )
}

/** The shape of a span's input, whatever its type. */
export function inputShape(span: Pick<Span, 'type' | 'input'>): Shape<unknown> {
    switch (span.type) {
        case 'agent':
            return agentInput(span.input)
        case 'step':
            return stepInput(span.input)
        case 'tool':
            return toolInput(span.input)
        case 'embedding':
            return embeddingInput(span.input)
    }
}

/** The shape of a span's output, whatever its type. */
export function outputShape(
    span: Pick<Span, 'type' | 'output'>,
): Shape<unknown> {
    switch (span.type) {
        case 'agent':
            return agentOutput(span.output)
        case 'step':
            return stepOutput(span.output)
        case 'tool':
            return toolOutput(span.output)
        case 'embedding':
            return embeddingOutput(span.output)
    }
}
