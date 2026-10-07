import {
    functionalUpdate,
    metaHelper,
    rowSortingFeature,
    tableFeatures,
    useTable,
    type ColumnDef,
    type RowData,
    type SortingState,
} from '@tanstack/react-table'
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

/** What a column says about itself, in its `meta`. */
export type DataTableColumnMeta = {
    /** Which edge the column's text sits at. Numbers go to the `end`. Defaults to `start`. */
    align?: 'start' | 'end'
    /**
     * The column is dropped below this width, before the table has to scroll. Secondary columns
     * go first: give the least important the widest breakpoint.
     */
    hideBelow?: 'xs' | 'md' | 'wide' | 'roomy'
    /** The cell names its row: it is a row header for screen readers. */
    rowHeader?: boolean
}

// Written out in full, so the stylesheet can see every class.
const hideBelow = {
    xs: 'hidden xs:table-cell',
    md: 'hidden md:table-cell',
    wide: 'hidden wide:table-cell',
    roomy: 'hidden roomy:table-cell',
} as const

const align = {
    start: 'text-left',
    end: 'text-right tabular-nums',
} as const

const features = tableFeatures({
    rowSortingFeature,
    columnMeta: metaHelper<DataTableColumnMeta>(),
})

/**
 * A column of a `DataTable`. Sorting is opted into with `enableSorting` and
 * `sortDescFirst` (the direction of the first click; ascending when left out).
 */
export type DataTableColumn<TData extends RowData> = ColumnDef<
    typeof features,
    TData
>

// Sorting is opted into per column; TanStack Table would sort every column with an accessor.
const defaultColumn = { enableSorting: false }

export type DataTableSort = { id: string; desc: boolean }

type DataTableProps<TData extends RowData> = {
    /** Keep the array stable between renders (module scope, or `useMemo`). */
    columns: DataTableColumn<TData>[]
    data: TData[]
    getRowId: (row: TData) => string
    /** The column the rows are sorted by, and the direction. Exactly one column is always sorted. */
    sort: DataTableSort
    onSortChange: (sort: DataTableSort) => void
    /** Shown inside the card, below the rows: where a page puts its `Pagination`. */
    footer?: ReactNode
    /** The table's accessible name. Visually hidden. */
    caption: string
    className?: string
}

/**
 * A table of rows the server has already sorted and paged. It owns no data, no sort state and no
 * navigation: a row that leads somewhere has a `RowLink` in one of its cells. On narrow screens
 * the table scrolls sideways inside its card and the first column stays in view.
 */
export function DataTable<TData extends RowData>({
    columns,
    data,
    getRowId,
    sort,
    onSortChange,
    footer,
    caption,
    className,
}: DataTableProps<TData>) {
    const sorting = useMemo<SortingState>(
        () => [{ id: sort.id, desc: sort.desc }],
        [sort.id, sort.desc],
    )

    const table = useTable({
        features,
        columns,
        defaultColumn,
        data,
        getRowId,
        state: { sorting },
        onSortingChange: (updater) => {
            const next = functionalUpdate(updater, sorting)[0]

            if (next) {
                onSortChange({ id: next.id, desc: next.desc })
            }
        },
        // The server sorts. A click on the sorted column flips it; no click clears the sort.
        manualSorting: true,
        enableSortingRemoval: false,
        enableMultiSort: false,
        sortDescFirst: false,
    })

    return (
        <div
            data-slot="data-table"
            className={cn(
                'overflow-hidden rounded-xl border bg-card text-card-foreground',
                className,
            )}
        >
            <Table className="border-separate border-spacing-0">
                <TableCaption className="sr-only">{caption}</TableCaption>
                <TableHeader>
                    {table.getHeaderGroups().map((group) => (
                        <TableRow
                            key={group.id}
                            className="border-b-0 hover:bg-transparent"
                        >
                            {group.headers.map((header, index) => {
                                const meta = header.column.columnDef.meta
                                const sortable = header.column.getCanSort()
                                const direction = header.column.getIsSorted()

                                return (
                                    <TableHead
                                        key={header.id}
                                        scope="col"
                                        aria-sort={
                                            sortable
                                                ? direction
                                                    ? direction === 'asc'
                                                        ? 'ascending'
                                                        : 'descending'
                                                    : 'none'
                                                : undefined
                                        }
                                        className={cn(
                                            'h-auto border-b bg-muted text-caption text-muted-foreground',
                                            sortable ? 'p-0' : 'px-4 py-2.75',
                                            align[meta?.align ?? 'start'],
                                            meta?.hideBelow &&
                                                hideBelow[meta.hideBelow],
                                            index === 0 &&
                                                'max-md:sticky max-md:left-0 max-md:z-1',
                                        )}
                                    >
                                        {header.isPlaceholder ? null : sortable ? (
                                            <Button
                                                variant="ghost"
                                                size="xs"
                                                data-sorted={
                                                    direction || undefined
                                                }
                                                onClick={header.column.getToggleSortingHandler()}
                                                className={cn(
                                                    // Fills the header cell, so the target is as tall as the cell.
                                                    'h-auto w-full gap-1.25 rounded-none px-4 py-2.75 text-caption font-medium text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:ring-inset data-[sorted]:text-foreground dark:hover:bg-transparent',
                                                    meta?.align === 'end'
                                                        ? 'justify-end'
                                                        : 'justify-start',
                                                )}
                                            >
                                                <table.FlexRender
                                                    header={header}
                                                />
                                                {direction === 'asc' ? (
                                                    <ArrowUpIcon
                                                        aria-hidden="true"
                                                        className="size-3"
                                                    />
                                                ) : direction === 'desc' ? (
                                                    <ArrowDownIcon
                                                        aria-hidden="true"
                                                        className="size-3"
                                                    />
                                                ) : (
                                                    <ArrowUpDownIcon
                                                        aria-hidden="true"
                                                        className="size-3 opacity-55"
                                                    />
                                                )}
                                            </Button>
                                        ) : (
                                            <table.FlexRender header={header} />
                                        )}
                                    </TableHead>
                                )
                            })}
                        </TableRow>
                    ))}
                </TableHeader>
                <TableBody>
                    {table.getRowModel().rows.map((row) => (
                        <TableRow
                            key={row.id}
                            className="group/row relative border-b-0 hover:bg-transparent"
                        >
                            {row.getAllCells().map((cell, index) => {
                                const meta = cell.column.columnDef.meta
                                const Cell = meta?.rowHeader
                                    ? TableHead
                                    : TableCell

                                return (
                                    <Cell
                                        key={cell.id}
                                        scope={
                                            meta?.rowHeader ? 'row' : undefined
                                        }
                                        className={cn(
                                            // Controls other than the row link sit above its stretched hit area.
                                            'h-auto border-b bg-card px-4 py-3 text-ui font-normal group-last/row:border-b-0 group-hover/row:bg-accent [&_a:not([data-slot=row-link])]:relative [&_a:not([data-slot=row-link])]:z-1 [&_button]:relative [&_button]:z-1',
                                            align[meta?.align ?? 'start'],
                                            meta?.hideBelow &&
                                                hideBelow[meta.hideBelow],
                                            index === 0 &&
                                                'max-md:sticky max-md:left-0 max-md:z-1',
                                        )}
                                    >
                                        <table.FlexRender cell={cell} />
                                    </Cell>
                                )
                            })}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {footer ? <div className="border-t px-4 py-3">{footer}</div> : null}
        </div>
    )
}
