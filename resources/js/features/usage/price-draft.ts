import { ApiError } from '@/api/client'
import type { PriceRatesText } from '@/api/prices'
import type { Price, PriceRates } from '@/api/types'
import { decimalText, parseDecimalText } from '@/lib/decimal-text'

/** The four rates of a price, in the order the table and the form show them. */
export const rateKeys = [
    'input',
    'output',
    'cache_read',
    'cache_write',
] as const satisfies readonly (keyof PriceRates)[]

export type RateKey = (typeof rateKeys)[number]

export const rateNames: Record<RateKey, string> = {
    input: 'Input',
    output: 'Output',
    cache_read: 'Cache read',
    cache_write: 'Cache write',
}

/** What is typed in each field. Blank is no rate; `0` is a free one. */
export type RateFields = Record<RateKey, string>

/** What a draft is waiting on: its save or its reset is under way. */
export type DraftBusy = 'saving' | 'resetting' | null

/** What went wrong with the last attempt, in a sentence; `retry` says what a second try would do. */
export type DraftFailure = { message: string; retry: 'save' | 'reset' | null }

/** A price being edited: what was typed, what it started as, and what the last attempt said. */
export type Draft = {
    initial: RateFields
    fields: RateFields
    /** Messages beside the fields, from the last attempt (or the check before it). */
    errors: Partial<Record<RateKey, string>>
    /** A message about the row as a whole. */
    failure: DraftFailure | null
    busy: DraftBusy
}

/** A model's identity in the editor's state: the provider and model together, since a model id is a provider's. */
export const priceKey = (price: Pick<Price, 'provider' | 'model'>) =>
    `${price.provider}\n${price.model}`

const fieldsOf = (rates: PriceRates): RateFields => ({
    input: decimalText(rates.input),
    output: decimalText(rates.output),
    cache_read: decimalText(rates.cache_read),
    cache_write: decimalText(rates.cache_write),
})

/**
 * A draft for a model that starts being edited. It starts from the rates the model is priced at
 * now: a saved price replaces the whole entry, so a model that is not saved yet starts from what
 * applies to it, and one that is saved from its own price.
 */
export function startDraft(price: Price): Draft {
    const fields = fieldsOf(price.rates)

    return {
        initial: fields,
        fields,
        errors: {},
        failure: null,
        busy: null,
    }
}

/** Whether the draft's rates differ from the ones it started with. Spelling alone (`3.0` for `3`) is not a change. */
export function isChanged(draft: Draft): boolean {
    return rateKeys.some((key) => {
        const now = parseDecimalText(draft.fields[key])
        const before = parseDecimalText(draft.initial[key])

        return !(now.ok && before.ok)
            ? draft.fields[key] !== draft.initial[key]
            : now.value !== before.value
    })
}

/**
 * The rates a draft says, as the text that was typed (trimmed): the number is read only to check
 * it, so nothing is rounded on the way to the server. Blank is `null`. Or the fields that are not
 * numbers.
 */
export function ratesOf(
    fields: RateFields,
):
    | { ok: true; rates: PriceRatesText }
    | { ok: false; errors: Partial<Record<RateKey, string>> } {
    const errors: Partial<Record<RateKey, string>> = {}
    const rates: PriceRatesText = {
        input: null,
        output: null,
        cache_read: null,
        cache_write: null,
    }

    for (const key of rateKeys) {
        const parsed = parseDecimalText(fields[key])

        if (parsed.ok) {
            rates[key] = parsed.value === null ? null : fields[key].trim()
        } else {
            errors[key] = parsed.message
        }
    }

    return Object.keys(errors).length === 0
        ? { ok: true, rates }
        : { ok: false, errors }
}

/** What a failed write says: messages beside fields, or one about the row. */
export type WriteFailure = {
    errors: Partial<Record<RateKey, string>>
    /** `null` when the fields' own messages say it all. */
    failure: DraftFailure | null
    /** The model is no longer listed: the list has to be read again. */
    gone: boolean
}

/** What to tell the person about a failed save or reset, by what the server answered. */
export function readFailure(
    error: unknown,
    action: 'save' | 'reset',
): WriteFailure {
    const verb = action === 'save' ? 'saved' : 'reset'
    const none = { errors: {}, gone: false }

    if (!(error instanceof ApiError)) {
        return {
            ...none,
            failure: {
                message: `The price could not be ${verb}.`,
                retry: null,
            },
        }
    }

    switch (error.status) {
        case null:
            return {
                ...none,
                failure: {
                    message: `The server could not be reached, so the price was not ${verb}.`,
                    retry: action,
                },
            }
        case 419:
            return {
                ...none,
                failure: {
                    message: `Your session has expired, so the price was not ${verb}. Reload the page to continue.`,
                    retry: null,
                },
            }
        case 403:
            return {
                ...none,
                failure: {
                    message: `You are not allowed to change prices, so the price was not ${verb}.`,
                    retry: null,
                },
            }
        case 404:
            return {
                errors: {},
                gone: true,
                failure: {
                    message: `This model is no longer listed, so its price was not ${verb}.`,
                    retry: null,
                },
            }
        case 422:
            return readInvalid(error, verb)
        default:
            return {
                ...none,
                failure: {
                    message: `The price was not ${verb}. The server answered with an error (${error.status}).`,
                    retry: action,
                },
            }
    }
}

/** A 422: each rate's own messages beside its field, and anything else about the row. */
function readInvalid(error: ApiError, verb: string): WriteFailure {
    const errors: Partial<Record<RateKey, string>> = {}
    const rest: string[] = []

    // The body is the server's, and is read for what it is: a value that is not a list of texts
    // says nothing, and the response's own message stands in.
    const named: unknown = error.errors
    const entries =
        typeof named === 'object' && named !== null
            ? Object.entries(named as Record<string, unknown>)
            : []

    for (const [name, value] of entries) {
        const messages = (Array.isArray(value) ? (value as unknown[]) : [value])
            .filter((message): message is string => typeof message === 'string')
            .filter((message) => message !== '')
        const key = rateKeys.find((rate) => rate === name)

        if (messages.length === 0) {
            rest.push(error.message)
        } else if (key !== undefined) {
            errors[key] = messages.join(' ')
        } else {
            rest.push(...messages)
        }
    }

    const row = [...new Set(rest)].join(' ')
    const message =
        row !== ''
            ? row
            : Object.keys(errors).length > 0
              ? null
              : `The price was not ${verb}. ${error.message}`

    return {
        errors,
        gone: false,
        failure: message === null ? null : { message, retry: null },
    }
}
