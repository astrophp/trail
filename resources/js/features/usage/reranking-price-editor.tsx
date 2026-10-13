import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { apiRequest, failureMessage } from '@/api/client'
import { priceKeys } from '@/api/prices'
import type { Price, PriceListResponse, PriceResponse } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { decimalText } from '@/lib/decimal-text'
import { useLeaveWarning } from '@/features/usage/use-leave-warning'

/** A separate price group: saves and resets preserve the ordinary token rates. */
export function RerankingPriceEditor({
    price,
    className,
}: {
    price: Price
    className?: string
}) {
    const id = useId()
    const client = useQueryClient()
    const [open, setOpen] = useState(false)
    const [basis, setBasis] = useState('none')
    const [input, setInput] = useState('')
    const [unit, setUnit] = useState('')
    const [dirty, setDirty] = useState(false)
    const path = `/prices?provider=${encodeURIComponent(price.provider)}&model=${encodeURIComponent(price.model)}`
    useLeaveWarning(open && dirty)
    const write = useMutation({
        mutationKey: priceKeys.write,
        mutationFn: (reset: boolean) =>
            apiRequest<PriceResponse>(
                reset ? `${path}&group=reranking` : path,
                reset
                    ? { method: 'DELETE' }
                    : {
                          method: 'PUT',
                          body: {
                              reranking: {
                                  basis: basis === 'none' ? null : basis,
                                  input: input.trim() || null,
                                  search_unit: unit.trim() || null,
                              },
                          },
                      },
            ),
        onSuccess: async ({ data }) => {
            await client.cancelQueries({ queryKey: priceKeys.list })
            client.setQueryData<PriceListResponse>(
                priceKeys.list,
                (current) =>
                    current && {
                        ...current,
                        data: current.data.map((row) =>
                            row.provider === data.provider &&
                            row.model === data.model
                                ? data
                                : row,
                        ),
                    },
            )
            setDirty(false)
            setOpen(false)
            void client.invalidateQueries({ queryKey: priceKeys.list })
        },
    })
    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (write.isPending) return
                if (
                    !next &&
                    dirty &&
                    !window.confirm('Discard unsaved reranking price changes?')
                )
                    return
                if (next) {
                    setBasis(price.reranking?.rates.basis ?? 'none')
                    setInput(decimalText(price.reranking?.rates.input ?? null))
                    setUnit(
                        decimalText(price.reranking?.rates.search_unit ?? null),
                    )
                    setDirty(false)
                    write.reset()
                }
                setOpen(next)
            }}
        >
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={className}
                    aria-label={`Edit reranking prices of ${price.provider} ${price.model}`}
                >
                    Reranking
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reranking prices</DialogTitle>
                    <DialogDescription>
                        {price.provider} · {price.model}. One selected basis
                        prices each call. Token prices are managed separately.
                        Recorded costs stay frozen.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="flex flex-col gap-4"
                    onSubmit={(event) => {
                        event.preventDefault()
                        write.mutate(false)
                    }}
                >
                    <div className="flex flex-col gap-2">
                        <Label htmlFor={`${id}-basis`}>Billing basis</Label>
                        <Select
                            value={basis}
                            onValueChange={(value) => {
                                setBasis(value)
                                setDirty(true)
                            }}
                            disabled={write.isPending}
                        >
                            <SelectTrigger
                                id={`${id}-basis`}
                                className="w-full"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Unpriced</SelectItem>
                                <SelectItem value="input_tokens">
                                    Input tokens
                                </SelectItem>
                                <SelectItem value="search_units">
                                    Search units
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor={`${id}-input`}>
                            USD per million input tokens
                        </Label>
                        <Input
                            id={`${id}-input`}
                            inputMode="decimal"
                            value={input}
                            disabled={write.isPending}
                            onChange={(event) => {
                                setInput(event.target.value)
                                setDirty(true)
                            }}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor={`${id}-unit`}>
                            USD per search unit
                        </Label>
                        <Input
                            id={`${id}-unit`}
                            inputMode="decimal"
                            value={unit}
                            disabled={write.isPending}
                            onChange={(event) => {
                                setUnit(event.target.value)
                                setDirty(true)
                            }}
                        />
                    </div>
                    <p className="text-caption text-muted-foreground">
                        Source: {price.reranking?.source ?? 'none'}. Blank rates
                        are unknown; 0 is an explicit free rate. The other
                        quantity is retained as evidence and is not billed.
                    </p>
                    {write.isError ? (
                        <p role="alert" className="text-ui text-destructive">
                            {failureMessage(write.error)}
                        </p>
                    ) : null}
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={write.isPending}
                            onClick={() => write.mutate(true)}
                        >
                            Reset reranking
                        </Button>
                        <Button type="submit" disabled={write.isPending}>
                            {write.isPending ? 'Saving…' : 'Save reranking'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
