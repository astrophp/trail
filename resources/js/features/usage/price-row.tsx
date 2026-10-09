import type { Price } from '@/api/types'
import { Button } from '@/components/ui/button'
import { TableCell, TableHead, TableRow } from '@/components/ui/table'
import { ModelLabel } from '@/components/telemetry/model-label'
import { PriceRate } from '@/components/telemetry/price-rate'
import { PriceEditor } from '@/features/usage/price-editor'
import {
    rateKeys,
    rateNames,
    type Draft,
    type RateKey,
} from '@/features/usage/price-draft'
import { PriceSource } from '@/features/usage/price-source'

/** How many columns the table has, which the form's row spans. */
export const priceColumns = 7

type PriceRowProps = {
    price: Price
    /** Present while the row is being edited. */
    draft: Draft | undefined
    onEdit: () => void
    onChange: (rate: RateKey, text: string) => void
    onSave: () => void
    onReset: () => void
    onCancel: () => void
    /** A ref callback for the row's Edit button or one of its fields, so focus can be moved to it. */
    targetRef: (
        target: RateKey | 'edit',
    ) => (element: HTMLElement | null) => void
}

/**
 * A model of the list: its name, its four rates, where they come from and the way to edit them.
 * The rates are the ones in force, read-only; editing opens a form in a row of its own under the
 * model, so a narrow screen has the room for four labelled fields. The Edit button is replaced by
 * that form and is back when it closes. Below `roomy` the rates and the source fold into a
 * summary under the name, so the row stays a name, a summary and Edit.
 */
export function PriceRow({
    price,
    draft,
    onEdit,
    onChange,
    onSave,
    onReset,
    onCancel,
    targetRef,
}: PriceRowProps) {
    return (
        <>
            <TableRow
                data-slot="price-row"
                className="hover:bg-transparent"
                data-state={draft ? 'editing' : undefined}
            >
                <TableHead
                    scope="row"
                    className="min-w-0 py-3 pl-4 wrap-anywhere whitespace-normal"
                >
                    <ModelLabel
                        of={{ provider: price.provider, model: price.model }}
                    />
                    <div
                        data-slot="price-summary"
                        className="mt-2 flex flex-col gap-1 text-caption font-normal text-muted-foreground roomy:hidden"
                    >
                        <p className="flex flex-wrap gap-x-3">
                            {rateKeys.map((rate) => (
                                <span key={rate}>
                                    {rateNames[rate]}{' '}
                                    <PriceRate
                                        rate={price.rates[rate]}
                                        className="text-foreground"
                                    />
                                </span>
                            ))}
                        </p>
                        <div className="xs:hidden">
                            <PriceSource price={price} />
                        </div>
                    </div>
                </TableHead>
                {rateKeys.map((rate) => (
                    <TableCell
                        key={rate}
                        data-rate={rate}
                        className="hidden px-4 py-3 text-right tabular-nums roomy:table-cell"
                    >
                        <PriceRate rate={price.rates[rate]} />
                    </TableCell>
                ))}
                <TableCell
                    data-column="source"
                    className="hidden px-4 py-3 whitespace-normal xs:table-cell"
                >
                    <PriceSource price={price} />
                </TableCell>
                <TableCell className="px-4 py-3 text-right">
                    {draft ? null : (
                        <Button
                            ref={targetRef('edit')}
                            variant="outline"
                            size="sm"
                            aria-label={`Edit the price of ${price.provider} ${price.model}`}
                            onClick={onEdit}
                        >
                            Edit
                        </Button>
                    )}
                </TableCell>
            </TableRow>
            {draft ? (
                <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={priceColumns} className="px-4 pb-4">
                        <PriceEditor
                            price={price}
                            draft={draft}
                            onChange={onChange}
                            onSave={onSave}
                            onReset={onReset}
                            onCancel={onCancel}
                            fieldRef={targetRef}
                        />
                    </TableCell>
                </TableRow>
            ) : null}
        </>
    )
}
