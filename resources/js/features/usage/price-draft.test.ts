import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import {
    isChanged,
    priceKey,
    ratesOf,
    readFailure,
    startDraft,
    type RateFields,
} from '@/features/usage/price-draft'
import { gpt5Mini, mystery, sonnet } from '@/test/prices-api'

const fields = (patch: Partial<RateFields> = {}): RateFields => ({
    input: '3',
    output: '15',
    cache_read: '',
    cache_write: '0',
    ...patch,
})

describe('startDraft', () => {
    it('starts from the rates in force: a free rate as 0 and a missing one as blank', () => {
        const draft = startDraft(gpt5Mini)

        expect(draft.fields).toEqual({
            input: '0.25',
            output: '2',
            cache_read: '0',
            cache_write: '',
        })
        expect(draft.initial).toEqual(draft.fields)
        expect(draft.busy).toBeNull()
        expect(draft.failure).toBeNull()
        expect(draft.errors).toEqual({})
    })

    it('starts a model with no rate from nothing, not from zeros', () => {
        expect(startDraft(mystery).fields).toEqual({
            input: '',
            output: '',
            cache_read: '',
            cache_write: '',
        })
    })
})

describe('priceKey', () => {
    it('tells two providers’ models of one name apart', () => {
        expect(priceKey({ provider: 'a', model: 'x' })).not.toBe(
            priceKey({ provider: 'b', model: 'x' }),
        )
        expect(priceKey({ provider: 'a b', model: 'c' })).not.toBe(
            priceKey({ provider: 'a', model: 'b c' }),
        )
    })
})

describe('isChanged', () => {
    it('is false for a draft that was only opened', () => {
        expect(isChanged(startDraft(sonnet))).toBe(false)
    })

    it('is false for the same number spelled differently', () => {
        const draft = startDraft(sonnet)

        expect(
            isChanged({ ...draft, fields: { ...draft.fields, input: '3.00' } }),
        ).toBe(false)
    })

    it('is true when a rate is cleared, and when a free rate replaces a blank', () => {
        const draft = startDraft(sonnet)
        const blank = startDraft(mystery)

        expect(
            isChanged({ ...draft, fields: { ...draft.fields, input: '' } }),
        ).toBe(true)
        expect(
            isChanged({ ...blank, fields: { ...blank.fields, input: '0' } }),
        ).toBe(true)
    })

    it('is true for text that is not a number yet', () => {
        const draft = startDraft(sonnet)

        expect(
            isChanged({ ...draft, fields: { ...draft.fields, input: '3.' } }),
        ).toBe(true)
    })
})

describe('ratesOf', () => {
    it('reads blank as null and zero as 0', () => {
        expect(ratesOf(fields())).toEqual({
            ok: true,
            rates: {
                input: '3',
                output: '15',
                cache_read: null,
                cache_write: '0',
            },
        })
    })

    it('reports every field that is not a number, and nothing else', () => {
        const read = ratesOf(fields({ input: 'x', cache_read: '-1' }))

        expect(read.ok).toBe(false)
        expect(!read.ok && Object.keys(read.errors)).toEqual([
            'input',
            'cache_read',
        ])
    })
})

describe('readFailure', () => {
    const error = (
        status: number | null,
        errors: Record<string, string[]> | null = null,
    ) => new ApiError('The server said so.', status, errors)

    it('puts the messages of the rates with their fields and joins several of one', () => {
        const read = readFailure(
            error(422, { input: ['a', 'b'], cache_write: ['c'] }),
            'save',
        )

        expect(read.errors).toEqual({ input: 'a b', cache_write: 'c' })
        expect(read.failure).toBeNull()
        expect(read.gone).toBe(false)
    })

    it('puts the messages of anything else on the row', () => {
        const read = readFailure(
            error(422, { model: ['m'], body: ['b'], input: ['i'] }),
            'save',
        )

        expect(read.errors).toEqual({ input: 'i' })
        expect(read.failure).toEqual({ message: 'm b', retry: null })
    })

    it('falls back to the server’s message for a 422 that names nothing', () => {
        expect(readFailure(error(422), 'save').failure?.message).toBe(
            'The price was not saved. The server said so.',
        )
    })

    it('offers a retry for no response and for an answer that is a server error, and not for the rest', () => {
        expect(readFailure(error(null), 'save').failure?.retry).toBe('save')
        expect(readFailure(error(500), 'reset').failure?.retry).toBe('reset')

        for (const status of [403, 404, 419, 422]) {
            expect(readFailure(error(status), 'save').failure?.retry).toBeNull()
        }
    })

    it('reads a message that is a bare text as one message', () => {
        const read = readFailure(
            error(422, { input: 'Too many places.' } as unknown as Record<
                string,
                string[]
            >),
            'save',
        )

        expect(read.errors).toEqual({ input: 'Too many places.' })
        expect(read.failure).toBeNull()
    })

    it('falls back to the response’s message for values that are not texts, and never throws', () => {
        for (const value of [{ a: 1 }, 7, null, [1, {}], []]) {
            const read = readFailure(
                error(422, { input: value } as unknown as Record<
                    string,
                    string[]
                >),
                'save',
            )

            expect(read.errors).toEqual({})
            expect(read.failure).toEqual({
                message: 'The server said so.',
                retry: null,
            })
        }
    })

    it('reads an errors body that is not an object', () => {
        const odd = new ApiError('The server said so.', 422, 'x' as never)

        expect(readFailure(odd, 'save').failure?.message).toBe(
            'The price was not saved. The server said so.',
        )
    })

    it('says a 404 means the model is gone', () => {
        expect(readFailure(error(404), 'reset')).toMatchObject({
            gone: true,
            failure: {
                message:
                    'This model is no longer listed, so its price was not reset.',
            },
        })
    })

    it('says nothing certain about a failure that is not from the server', () => {
        expect(readFailure(new Error('boom'), 'save')).toEqual({
            errors: {},
            gone: false,
            failure: { message: 'The price could not be saved.', retry: null },
        })
    })
})
