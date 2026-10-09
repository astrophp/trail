import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    priceKeys,
    resetPrice,
    savePrice,
    type PriceId,
    type PriceRatesText,
} from '@/api/prices'
import type { Price, PriceListResponse } from '@/api/types'
import { notify } from '@/components/patterns/notify'
import {
    isChanged,
    priceKey,
    rateKeys,
    ratesOf,
    readFailure,
    startDraft,
    type Draft,
    type RateKey,
} from '@/features/usage/price-draft'

/** Where focus goes once the draft has been drawn: the row's Edit button, its first field, or its first field with an error. */
type FocusRequest = { key: string; target: 'edit' | 'first' | 'error' }

type Write = { price: PriceId; rates: PriceRatesText | null }

const named = (price: PriceId) => `${price.provider} ${price.model}`

/**
 * The rows being edited. A draft belongs to its model (`provider` and `model` together), lives
 * here and not in the row, and so survives the list being read again, the row being filtered out
 * and the tab being switched: the list only ever changes what is drawn read-only. A model that
 * the list no longer holds has no draft.
 *
 * Saving or resetting writes through one mutation, and what each row is doing is its draft's
 * `busy`, so rows save independently. The response replaces the row in the cached list at once,
 * and the list is read again when the last write settles.
 */
export function usePriceEditor(prices: Price[] | undefined) {
    const queryClient = useQueryClient()
    const [all, setAll] = useState<Record<string, Draft>>({})
    const targets = useRef(new Map<string, HTMLElement>())
    const wanted = useRef<FocusRequest | null>(null)

    const listed = useMemo(
        () => new Set((prices ?? []).map(priceKey)),
        [prices],
    )
    const drafts = useMemo(
        () =>
            Object.fromEntries(
                Object.entries(all).filter(([key]) => listed.has(key)),
            ),
        [all, listed],
    )
    // A model the list no longer holds loses its draft for good, so it cannot come back stale if
    // a later read lists the model again.
    if (
        prices !== undefined &&
        Object.keys(all).some((key) => !listed.has(key))
    ) {
        setAll((current) =>
            Object.fromEntries(
                Object.entries(current).filter(([key]) => listed.has(key)),
            ),
        )
    }

    const unsaved = Object.values(drafts).some(isChanged)

    const write = useMutation({
        mutationKey: priceKeys.write,
        mutationFn: ({ price, rates }: Write) =>
            rates === null ? resetPrice(price) : savePrice(price, rates),
        onSuccess: async ({ data }) => {
            // A read that began before this write may carry the price from before it.
            await queryClient.cancelQueries({ queryKey: priceKeys.list })
            queryClient.setQueryData<PriceListResponse>(
                priceKeys.list,
                (list) =>
                    list && {
                        ...list,
                        data: list.data.map((price) =>
                            priceKey(price) === priceKey(data) ? data : price,
                        ),
                    },
            )
        },
        onSettled: () => {
            // This write is still counted as under way here.
            if (queryClient.isMutating({ mutationKey: priceKeys.write }) <= 1) {
                void queryClient.invalidateQueries({ queryKey: priceKeys.list })
            }
        },
    })

    const update = useCallback(
        (key: string, change: (draft: Draft) => Draft) =>
            setAll((current) =>
                current[key]
                    ? { ...current, [key]: change(current[key]) }
                    : current,
            ),
        [],
    )
    const close = useCallback(
        (key: string) =>
            setAll((current) => {
                const { [key]: closed, ...rest } = current
                void closed

                return rest
            }),
        [],
    )

    // Focus is moved once the draft it is for has been drawn.
    useEffect(() => {
        const request = wanted.current

        if (request === null) {
            return
        }

        wanted.current = null

        const field: RateKey | 'edit' =
            request.target === 'edit'
                ? 'edit'
                : request.target === 'error'
                  ? (rateKeys.find((rate) => all[request.key]?.errors[rate]) ??
                    rateKeys[0])
                  : rateKeys[0]

        targets.current.get(`${request.key}\n${field}`)?.focus()
    }, [all])

    const run = async (price: Price, action: 'save' | 'reset') => {
        const key = priceKey(price)
        const draft = drafts[key]

        if (draft === undefined || draft.busy !== null) {
            return
        }

        // A reset throws away what was typed: ask once, unless this is the retry of one already asked.
        if (
            action === 'reset' &&
            isChanged(draft) &&
            draft.failure?.retry !== 'reset' &&
            !window.confirm(
                `Discard your changes and reset the price of ${named(price)}?`,
            )
        ) {
            return
        }

        let rates: PriceRatesText | null = null

        if (action === 'save') {
            const read = ratesOf(draft.fields)

            if (!read.ok) {
                wanted.current = { key, target: 'error' }
                update(key, (current) => ({
                    ...current,
                    errors: read.errors,
                    failure: null,
                }))

                return
            }

            rates = read.rates
        }

        update(key, (current) => ({
            ...current,
            busy: action === 'save' ? 'saving' : 'resetting',
            errors: {},
            failure: null,
        }))

        try {
            await write.mutateAsync({ price, rates })
            wanted.current = { key, target: 'edit' }
            close(key)
            notify.success(
                action === 'save'
                    ? `Saved the price of ${named(price)}.`
                    : `Reset the price of ${named(price)}.`,
            )
        } catch (error) {
            const failed = readFailure(error, action)

            wanted.current = { key, target: 'error' }
            update(key, (current) => ({
                ...current,
                busy: null,
                errors: failed.errors,
                failure: failed.failure,
            }))

            // The list is read again when the write settles, and no longer has the model.
            if (failed.gone) {
                notify.error(
                    `${named(price)} is no longer listed. Its price was not ${action === 'save' ? 'saved' : 'reset'}.`,
                )
            }
        }
    }

    return {
        /** The rows being edited, by `priceKey`. */
        drafts,
        /** Some draft holds a change that was not saved. */
        unsaved,
        edit: (price: Price) => {
            wanted.current = { key: priceKey(price), target: 'first' }
            setAll((current) => ({
                ...current,
                [priceKey(price)]: startDraft(price),
            }))
        },
        change: (price: Price, rate: RateKey, text: string) =>
            update(priceKey(price), (draft) => {
                const { [rate]: edited, ...errors } = draft.errors
                void edited

                return {
                    ...draft,
                    fields: { ...draft.fields, [rate]: text },
                    errors,
                }
            }),
        cancel: (price: Price) => {
            wanted.current = { key: priceKey(price), target: 'edit' }
            close(priceKey(price))
        },
        save: (price: Price) => run(price, 'save'),
        reset: (price: Price) => run(price, 'reset'),
        /** A ref callback for something focus may be moved to: a row's `edit` button, or one of its rates. */
        register: (price: Price, target: RateKey | 'edit') => {
            const id = `${priceKey(price)}\n${target}`

            return (element: HTMLElement | null) => {
                if (element) {
                    targets.current.set(id, element)
                } else {
                    targets.current.delete(id)
                }
            }
        },
    }
}

export type PriceEditor = ReturnType<typeof usePriceEditor>
