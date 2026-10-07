/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** A response the PHP contract test froze in tests/Contract (`meta`, `traces`, `trace`, `enums`, `bookmark`). */
export function contractFixture(
    name: 'meta' | 'traces' | 'trace' | 'enums' | 'bookmark',
): unknown {
    const path = resolve(
        import.meta.dirname,
        `../../../tests/Contract/${name}.json`,
    )

    return JSON.parse(readFileSync(path, 'utf8')) as unknown
}
