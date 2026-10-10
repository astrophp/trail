import { isContainer, type JsonObject, type JsonValue } from '@/lib/json'

/** Payloads are whatever the agent stored: these read a part without trusting its type. */

/** The value as an object, or `null` when it is anything else (an array included). */
export function asObject(value: JsonValue | undefined): JsonObject | null {
    return value !== undefined && isContainer(value) && !Array.isArray(value)
        ? value
        : null
}

/** The value as an array, or `null` when it is anything else. */
export function asArray(value: JsonValue | undefined): JsonValue[] | null {
    return Array.isArray(value) ? value : null
}

/** Whether the value is missing or `null`: nothing was stored. */
export function isAbsent(
    value: JsonValue | undefined,
): value is undefined | null {
    return value === undefined || value === null
}

/** Whether a stored part is absent or a string. */
export function isTextOrAbsent(value: JsonValue | undefined): boolean {
    return isAbsent(value) || typeof value === 'string'
}

/** Whether a stored part is absent or a number. */
export function isNumberOrAbsent(value: JsonValue | undefined): boolean {
    return isAbsent(value) || typeof value === 'number'
}
