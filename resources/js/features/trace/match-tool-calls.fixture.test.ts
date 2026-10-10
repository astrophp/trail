/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Span } from '@/api/types'
import {
    matchToolCalls,
    type RequestedCall,
} from '@/features/trace/match-tool-calls'
import type { JsonValue } from '@/lib/json'
import { asObject } from '@/lib/payload-access'
import { makeSpan } from '@/test/trace-api'

/*
 * The cases the server's linking test (tests/Unit/Transcript/LinkingTest.php) runs, held against
 * the trace page's matcher too, so both link the same calls. A case lists the spans of one turn
 * and, for some messages of the transcript, the span each tool call is linked to.
 */

type FixtureSpan = {
    id: string
    type: Span['type']
    sequence: number
    name?: string
    attempt?: number
    parent?: string | null
    input?: JsonValue
    output?: JsonValue
    redacted?: boolean
    truncated?: boolean
    truncated_paths?: Record<string, number>
}

type FixtureCase = {
    name: string
    spans: FixtureSpan[]
    expect: Record<string, (string | null)[]>
}

const fixture = JSON.parse(
    readFileSync(
        resolve(
            import.meta.dirname,
            '../../../../tests/Fixtures/Transcript/linking.json',
        ),
        'utf8',
    ),
) as { cases: FixtureCase[] }

/**
 * Places the trace page has no counterpart for, as `case name` then the place, with the reason.
 * Each is about linking a call found in a later step's stored input by its id, which only the
 * conversation transcript does; the trace page lists the calls a step requested in its own
 * output and has no such message. A skipped place is still checked to exist in the fixture.
 */
const transcriptOnly: Record<string, string> = {
    'a duplicate call id links the call but gives no link by id|s2:input.messages.0':
        'the transcript refuses a link when two calls share an id; a step lists its own calls',
    'an id repeated in two steps gives no link by id|s2:input.messages.0':
        'the transcript refuses a link when an id appears in two steps',
    'a null call id links the call but gives no link by id|s2:input.messages.0':
        'the transcript needs a call id to find the call in a later step',
}

function spanOf(entry: FixtureSpan): Span {
    return makeSpan(entry.id, {
        type: entry.type,
        sequence: entry.sequence,
        name: entry.name ?? 'step',
        attempt: entry.attempt ?? 1,
        parent_id:
            entry.parent !== undefined
                ? entry.parent
                : entry.id === 'r'
                  ? null
                  : 'r',
        input: entry.input ?? null,
        output: entry.output ?? null,
        redacted: entry.redacted ?? false,
        truncated: entry.truncated ?? false,
        truncated_paths: entry.truncated_paths ?? {},
    })
}

function requestedBy(step: Span): RequestedCall[] {
    const list = asObject(step.output)?.tool_calls

    return (Array.isArray(list) ? list : []).map((entry) => {
        const object = asObject(entry)

        return {
            name: typeof object?.name === 'string' ? object.name : null,
            arguments: object === null ? undefined : object.arguments,
        }
    })
}

/**
 * The step that asked for the calls stored at a place: `sN:output` is step sN itself; a message in
 * the input of sN holds calls the agent's previous step (same parent and attempt) asked for.
 */
function askingStep(spans: Span[], place: string): Span {
    const [id, path] = place.split(':', 2)
    const stored = spans.find((span) => span.id === id)

    if (stored === undefined) {
        throw new Error(`No span ${id} in the case.`)
    }

    if (path === 'output') {
        return stored
    }

    const before = spans
        .filter(
            (span) =>
                span.type === 'step' &&
                span.parent_id === stored.parent_id &&
                span.attempt === stored.attempt &&
                span.sequence < stored.sequence,
        )
        .sort((a, b) => b.sequence - a.sequence)[0]

    if (before === undefined) {
        throw new Error(`No step before ${id} asked for the calls at ${place}.`)
    }

    return before
}

describe('the cases the server links by', () => {
    it('reads the cases and the skipped places exist', () => {
        const places = new Set(
            fixture.cases.flatMap((entry) =>
                Object.keys(entry.expect).map(
                    (place) => `${entry.name}|${place}`,
                ),
            ),
        )

        expect(fixture.cases.length).toBeGreaterThan(30)

        for (const key of Object.keys(transcriptOnly)) {
            expect(places.has(key)).toBe(true)
        }
    })

    for (const entry of fixture.cases) {
        it(entry.name, () => {
            const spans = entry.spans.map(spanOf)

            for (const [place, links] of Object.entries(entry.expect)) {
                if (`${entry.name}|${place}` in transcriptOnly) {
                    continue
                }

                const step = askingStep(spans, place)
                const calls = requestedBy(step)

                expect(calls.length).toBe(links.length)
                expect(
                    matchToolCalls(step, calls, spans).map(
                        (span) => span?.id ?? null,
                    ),
                    `Links at ${place}.`,
                ).toEqual(links)
            }
        })
    }
})
