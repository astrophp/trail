/** What typed text means as a number: a value, no value (blank), or a reason it cannot be one. */
export type DecimalText =
    { ok: true; value: number | null } | { ok: false; message: string }

const plainDecimal = /^\d+(\.\d+)?$/

/**
 * Typed text as a number, strictly: plain decimal notation only (`3`, `3.75`, `0`), with spaces
 * around it ignored. Nothing is rounded or cut, and nothing is guessed: no sign, no exponent, no
 * `.5`, no thousands separator. Blank is no value (`null`), never `0`; `0` is the value `0`.
 */
export function parseDecimalText(text: string): DecimalText {
    const trimmed = text.trim()

    if (trimmed === '') {
        return { ok: true, value: null }
    }

    const value = Number(trimmed)

    if (!plainDecimal.test(trimmed) || !Number.isFinite(value)) {
        return {
            ok: false,
            message: 'Enter a plain number such as 3.75, or leave it blank.',
        }
    }

    return { ok: true, value }
}

/** A number as the text a field starts with: no value is blank, `0` is `0`. */
export function decimalText(value: number | null): string {
    return value === null ? '' : String(value)
}
