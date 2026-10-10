import type { Price } from '@/api/types'
import {
    Table,
    TableBody,
    TableCaption,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { priceKey, rateKeys, rateNames } from '@/features/usage/price-draft'
import { PriceRow } from '@/features/usage/price-row'
import type { PriceEditor } from '@/features/usage/use-price-editor'
import { cn } from '@/lib/utils'

const head =
    'h-auto border-b bg-muted px-4 py-2.75 text-caption font-medium text-muted-foreground'

/**
 * The models of one view of the list, in the order the server gave them. The rates and the
 * source are read-only; each row opens its own editor, and any number can be open at once.
 */
export function PriceTable({
    prices,
    editor,
    className,
}: {
    prices: Price[]
    editor: PriceEditor
    className?: string
}) {
    return (
        <Table className={cn('border-separate border-spacing-0', className)}>
            <TableCaption className="sr-only">
                Model prices, in US dollars per million tokens
            </TableCaption>
            <TableHeader>
                <TableRow className="border-b-0 hover:bg-transparent">
                    <TableHead scope="col" className={cn(head, 'pl-4')}>
                        Model
                    </TableHead>
                    {rateKeys.map((rate) => (
                        <TableHead
                            key={rate}
                            scope="col"
                            className={cn(
                                head,
                                'hidden text-right roomy:table-cell',
                            )}
                        >
                            {rateNames[rate]}
                        </TableHead>
                    ))}
                    <TableHead
                        scope="col"
                        className={cn(head, 'hidden xs:table-cell')}
                    >
                        Source
                    </TableHead>
                    <TableHead scope="col" className={head}>
                        <span className="sr-only">Actions</span>
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {prices.map((price) => (
                    <PriceRow
                        key={priceKey(price)}
                        price={price}
                        draft={editor.drafts[priceKey(price)]}
                        onEdit={() => editor.edit(price)}
                        onChange={(rate, text) =>
                            editor.change(price, rate, text)
                        }
                        onSave={() => void editor.save(price)}
                        onReset={() => void editor.reset(price)}
                        onCancel={() => editor.cancel(price)}
                        targetRef={(target) => editor.register(price, target)}
                    />
                ))}
            </TableBody>
        </Table>
    )
}
