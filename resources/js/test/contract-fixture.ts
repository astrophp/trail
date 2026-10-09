/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** A response the PHP contract test froze in tests/Contract (`meta`, `traces`, `trace`, `enums`, `bookmark`, `neighbours`, `conversations`, `conversation`, `overview`, `attention`, `agents`, `agent`, `agent-breakdown`, `usage`, `usage-breakdown`, `prices`, `price`). */
export function contractFixture(
    name:
        | 'meta'
        | 'traces'
        | 'trace'
        | 'enums'
        | 'bookmark'
        | 'neighbours'
        | 'conversations'
        | 'conversation'
        | 'overview'
        | 'attention'
        | 'agents'
        | 'agent'
        | 'agent-breakdown'
        | 'usage'
        | 'usage-breakdown'
        | 'prices'
        | 'price',
): unknown {
    const path = resolve(
        import.meta.dirname,
        `../../../tests/Contract/${name}.json`,
    )

    return JSON.parse(readFileSync(path, 'utf8')) as unknown
}
