import type { Span } from '@/api/types'
import { asObject } from '@/lib/payload-access'
import { jsonEqual, type JsonValue } from '@/lib/json'

/** What a step asked for in one tool call: the tool's name and arguments, `null`/`undefined` where unreadable. */
export type RequestedCall = {
    name: string | null
    arguments: JsonValue | undefined
}

/** The arguments a tool span stored, or `undefined` when it stored no input (payload capture was off). */
function storedArguments(span: Span): JsonValue | undefined {
    return span.input === null ? undefined : asObject(span.input)?.arguments
}

/**
 * The tool span that ran each tool call a step requested, or `null` where none can be named with
 * certainty. Tool spans store no call id, so the link is built from structure and then confirmed:
 *
 * 1. Candidates are the tool spans with the step's parent and attempt, recorded after the step and
 *    before the agent's next step. A delegated agent's tools have another parent and are never
 *    candidates.
 * 2. The i-th call of a name takes the i-th candidate of that name only when the candidate's stored
 *    arguments equal the call's (key order aside).
 * 3. A call still without a span takes the one unpaired candidate of its name whose arguments equal
 *    its own, when there is exactly one.
 * 4. A candidate that stored no input cannot be checked: it is taken by position, and only when the
 *    step requested as many calls of that name as there are candidates.
 *
 * Anything else is no link: a wrong link is worse than none.
 */
export function matchToolCalls(
    step: Pick<Span, 'parent_id' | 'attempt' | 'sequence'>,
    calls: readonly RequestedCall[],
    spans: readonly Span[],
): (Span | null)[] {
    const level = spans.filter(
        (span) =>
            span.parent_id === step.parent_id && span.attempt === step.attempt,
    )
    const nextStep = Math.min(
        ...level
            .filter(
                (span) => span.type === 'step' && span.sequence > step.sequence,
            )
            .map((span) => span.sequence),
    )
    const candidates = level
        .filter(
            (span) =>
                span.type === 'tool' &&
                span.sequence > step.sequence &&
                span.sequence < nextStep,
        )
        .sort((a, b) => a.sequence - b.sequence)
    const result: (Span | null)[] = calls.map(() => null)
    const taken = new Set<Span>()
    const names = new Set(calls.flatMap((call) => call.name ?? []))

    for (const name of names) {
        const mine = candidates.filter((span) => span.name === name)
        const indexes = calls.flatMap((call, index) =>
            call.name === name ? index : [],
        )
        const link = (index: number, span: Span) => {
            result[index] = span
            taken.add(span)
        }

        indexes.forEach((callIndex, position) => {
            const span = mine[position]
            const stored =
                span === undefined ? undefined : storedArguments(span)
            const asked = calls[callIndex].arguments

            if (
                span !== undefined &&
                stored !== undefined &&
                asked !== undefined &&
                jsonEqual(stored, asked)
            ) {
                link(callIndex, span)
            }
        })

        for (const callIndex of indexes) {
            const asked = calls[callIndex].arguments

            if (result[callIndex] !== null || asked === undefined) {
                continue
            }

            const equal = mine.filter((span) => {
                const stored = storedArguments(span)

                return (
                    !taken.has(span) &&
                    stored !== undefined &&
                    jsonEqual(stored, asked)
                )
            })

            if (equal.length === 1) {
                link(callIndex, equal[0])
            }
        }

        if (mine.length === indexes.length) {
            indexes.forEach((callIndex, position) => {
                const span = mine[position]

                if (
                    result[callIndex] === null &&
                    !taken.has(span) &&
                    storedArguments(span) === undefined
                ) {
                    link(callIndex, span)
                }
            })
        }
    }

    return result
}
