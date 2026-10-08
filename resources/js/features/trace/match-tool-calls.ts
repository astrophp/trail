import type { Span } from '@/api/types'
import { within } from '@/components/telemetry/payload-truncation'
import { asObject } from '@/lib/payload-access'
import { jsonEqual, type JsonValue } from '@/lib/json'

/** What a step asked for in one tool call: the tool's name and arguments, `null`/`undefined` where unreadable. */
export type RequestedCall = {
    name: string | null
    arguments: JsonValue | undefined
}

/** What redaction writes in place of a value. */
const redactedMarker = '[redacted]'

/** How many cut paths a span keeps; a span that lists this many may have lost more. */
const maxCutPaths = 50

type Stored = Pick<Span, 'redacted' | 'truncated' | 'truncated_paths'>

/** The arguments a tool span stored, or `undefined` when it stored no input (payload capture was off). */
function storedArguments(span: Span): JsonValue | undefined {
    return span.input === null ? undefined : asObject(span.input)?.arguments
}

/**
 * Whether the span was cut at the exact path or beneath the other, or was cut somewhere it does not
 * say (no path kept, or as many as the span keeps). A path matches whole segments only:
 * `output.tool_calls.1` is not `output.tool_calls.10`.
 */
function cutAt(span: Stored, exact: string, beneath: string): boolean {
    if (!span.truncated) {
        return false
    }

    const cuts = Object.keys(span.truncated_paths)

    if (cuts.length === 0 || cuts.length >= maxCutPaths) {
        return true
    }

    return cuts.some((cut) => cut === exact || within(cut, beneath))
}

/** Whether the span was redacted and the value holds the marker redaction leaves. */
function wasRedacted(span: Stored, value: JsonValue | undefined): boolean {
    return (
        span.redacted && (JSON.stringify(value) ?? '').includes(redactedMarker)
    )
}

/**
 * Whether a tool span's stored arguments can be compared: not redacted (the marker makes different
 * arguments look equal) and not cut (a cut that names no path could have reached them).
 */
function candidateTrusted(span: Span): boolean {
    return (
        !wasRedacted(span, storedArguments(span)) &&
        !cutAt(span, 'input', 'input.arguments')
    )
}

/** Whether the step's `index`-th requested call kept its arguments whole. */
function callTrusted(
    step: Stored,
    index: number,
    call: RequestedCall,
): boolean {
    return (
        call.arguments !== undefined &&
        !wasRedacted(step, call.arguments) &&
        !cutAt(step, 'output.tool_calls', `output.tool_calls.${index}`)
    )
}

/**
 * The tool span that ran each tool call a step requested, or `null` where the stored arguments do
 * not confirm one. Tool spans store no call id, so a link is made only when the arguments of the
 * call and of the span are the same JSON (key order aside). Position alone never links: a tool
 * that failed before it started, or ran in another order, would hand the wrong span to a call.
 *
 * `calls` are the entries of the step's `output.tool_calls`, in order. Candidates are the tool
 * spans with the step's parent and attempt, recorded after the step and before the agent's next
 * step; a delegated agent's tools have another parent and are never candidates. Per tool name:
 *
 * 1. The k-th call takes the k-th candidate when the arguments of both are equal.
 * 2. A call still without a span takes the one candidate not yet taken whose arguments equal its
 *    own, when there is exactly one.
 *
 * These stay unlinked: a call that stored no arguments, a candidate that stored no input, a call
 * or a candidate whose arguments were redacted or cut, a call that two candidates match equally,
 * and a call whose arguments no candidate holds.
 */
export function matchToolCalls(
    step: Pick<Span, 'parent_id' | 'attempt' | 'sequence'> & Stored,
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
                callTrusted(step, callIndex, calls[callIndex]) &&
                candidateTrusted(span) &&
                stored !== undefined &&
                asked !== undefined &&
                jsonEqual(stored, asked)
            ) {
                link(callIndex, span)
            }
        })

        for (const callIndex of indexes) {
            const asked = calls[callIndex].arguments

            if (
                result[callIndex] !== null ||
                asked === undefined ||
                !callTrusted(step, callIndex, calls[callIndex])
            ) {
                continue
            }

            const equal = mine.filter((span) => {
                const stored = storedArguments(span)

                return (
                    !taken.has(span) &&
                    candidateTrusted(span) &&
                    stored !== undefined &&
                    jsonEqual(stored, asked)
                )
            })

            if (equal.length === 1) {
                link(callIndex, equal[0])
            }
        }
    }

    return result
}
