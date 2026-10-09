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
import { TableBusyContext } from '@/components/patterns/table-busy'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import type { TableSort } from '@/lib/table-sort'
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
    /**
     * Classes for every cell of the column, header and skeleton included. For what the other keys
     * do not say: a column that takes the width the others leave, for one.
     */
    className?: string
    /** The cell names its row: it is a row header for screen readers. */
    rowHeader?: boolean
    /**
     * What stands in for this column's cell while the first load is on. One short line when
     * left out; give a few stacked lines when the real cell is taller than one, so the rows
     * do not change height when they arrive. Hidden from assistive technology by the table.
     */
    skeleton?: ReactNode
    /** Sits before the header's label, outside its sort button: a control for the whole column. */
    lead?: ReactNode
    /**
     * Wherever the table scrolls sideways, the column stays in view at the right edge (the first
     * column does so at the left on narrow screens). For a narrow column of one control, which
     * would otherwise be scrolled out of reach. It does nothing while the table fits.
     */
    stickyEnd?: boolean
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

// A pinned end cell is opaque (each context gives it a background), sits above the cells that slide
// under it, and fades them out where they meet it, with a mask on a copy of its own background.
const stickyEnd =
    'sticky right-0 z-1 before:pointer-events-none before:absolute before:inset-y-0 before:right-full before:w-3 before:bg-inherit before:[mask-image:linear-gradient(to_right,transparent,black)]'

// The row link's focus ring (inset, over the whole row) is hidden under a pinned cell, so the cell
// draws its share of it: the top, right and bottom edges. Below `md` the link covers its own cell only.
const stickyEndRing =
    'md:group-has-[[data-slot=row-link]:focus-visible]/row:after:pointer-events-none md:group-has-[[data-slot=row-link]:focus-visible]/row:after:absolute md:group-has-[[data-slot=row-link]:focus-visible]/row:after:inset-0 md:group-has-[[data-slot=row-link]:focus-visible]/row:after:border-y-3 md:group-has-[[data-slot=row-link]:focus-visible]/row:after:border-r-3 md:group-has-[[data-slot=row-link]:focus-visible]/row:after:border-ring/50'

/**
 * The classes every cell of a column shares, in the header, the rows and the skeleton rows:
 * alignment, the breakpoint it is dropped at, the first column staying in view and a
 * `stickyEnd` column staying in view at the other edge.
 */
function columnClasses(
    meta: DataTableColumnMeta | undefined,
    index: number,
): string {
    return cn(
        align[meta?.align ?? 'start'],
        meta?.hideBelow && hideBelow[meta.hideBelow],
        meta?.className,
        index === 0 && 'max-md:sticky max-md:left-0 max-md:z-1',
        meta?.stickyEnd && stickyEnd,
    )
}

/**
 * The look of a skeleton bar drawn for a column (`meta.skeleton`): visible against the card in
 * both themes, and still for people who prefer reduced motion. Add the size to it.
 */
export const skeletonBarClass = 'bg-border motion-reduce:animate-none'

const features = tableFeatures({
    rowSortingFeature,
    columnMeta: metaHelper<DataTableColumnMeta>(),
})

/**
 * A column of a `DataTable`. Sorting is opted into with `enableSorting` and
 * `sortDescFirst` (the direction of the first click; ascending when left out).
 * A sortable column also needs an accessor (`accessorKey` or `accessorFn`): TanStack Table
 * reports a column without one as not sortable, and its header renders without a button.
 */
export type DataTableColumn<TData extends RowData> = ColumnDef<
    typeof features,
    TData
>

// Sorting is opted into per column; TanStack Table would sort every column with an accessor.
const defaultColumn = { enableSorting: false }

export type DataTableSort = TableSort

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
    /**
     * The first load: the header stays and the body is `skeletonRows` placeholder rows shaped
     * like the columns. `data` is ignored. The table is `aria-busy` and says "Loading" once.
     */
    loading?: boolean
    /** How many placeholder rows `loading` draws. Defaults to 8. */
    skeletonRows?: number
    /** What assistive technology is told while `loading` or `busy` is on. Defaults to "Loading". */
    loadingLabel?: string
    /**
     * A refresh in place (the next page, another sort): the rows stay, dimmed, and the table is
     * `aria-busy`. Use it for rows that answer for the previous view. Only the rows are dimmed,
     * never the `empty` slot. Cells can read it from `TableBusyContext`, to disable a control that
     * writes to the cache of a row that is not the one being fetched.
     */
    busy?: boolean
    /**
     * Shown inside the card, below the header, when `data` is empty and the table is not
     * loading. The footer is not shown then.
     */
    empty?: ReactNode
    className?: string
}

/**
 * A table of rows the server has already sorted and paged. It owns no data, no sort state and no
 * navigation: a row that leads somewhere has a `RowLink` in one of its cells. On narrow screens
 * the table scrolls sideways inside its card and the first column stays in view; a column with
 * `meta.stickyEnd` stays in view at the right edge wherever the table scrolls.
 *
 * It also draws what is not the happy path: `loading` (skeleton rows), `busy` (rows kept while a
 * refresh runs) and `empty` (a slot for when there is nothing to show).
 */
export function DataTable<TData extends RowData>({
    columns,
    data,
    getRowId,
    sort,
    onSortChange,
    footer,
    caption,
    loading = false,
    skeletonRows = 8,
    loadingLabel = 'Loading',
    busy = false,
    empty,
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

    const rows = table.getRowModel().rows
    const showEmpty = !loading && rows.length === 0 && empty !== undefined
    // The rows and the footer that describes them, never the empty slot.
    const dimmed = cn(
        'motion-safe:transition-opacity',
        busy && !loading && 'opacity-60',
    )

    return (
        <TableBusyContext value={busy}>
            <div
                data-slot="data-table"
                className={cn(
                    'overflow-hidden rounded-xl border bg-card text-card-foreground',
                    className,
                )}
            >
                {/* Always mounted, so a change of its text is announced. */}
                <span role="status" className="sr-only">
                    {loading || busy ? loadingLabel : ''}
                </span>
                <Table
                    aria-busy={loading || busy || undefined}
                    className="border-separate border-spacing-0"
                >
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
                                    const direction =
                                        header.column.getIsSorted()

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
                                                sortable
                                                    ? 'p-0'
                                                    : 'px-4 py-2.75',
                                                columnClasses(meta, index),
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    meta?.lead &&
                                                        'flex items-center pl-4',
                                                )}
                                            >
                                                {meta?.lead}
                                                {header.isPlaceholder ? null : sortable ? (
                                                    <Button
                                                        variant="ghost"
                                                        size="xs"
                                                        data-sorted={
                                                            direction ||
                                                            undefined
                                                        }
                                                        onClick={header.column.getToggleSortingHandler()}
                                                        className={cn(
                                                            // Fills the header cell, so the target is as tall as the cell.
                                                            'h-auto w-full gap-1.25 rounded-none px-4 py-2.75 text-caption font-medium text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:ring-inset data-[sorted]:text-foreground dark:hover:bg-transparent',
                                                            meta?.align ===
                                                                'end'
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
                                                        ) : direction ===
                                                          'desc' ? (
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
                                                    <table.FlexRender
                                                        header={header}
                                                    />
                                                )}
                                            </div>
                                        </TableHead>
                                    )
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    {loading ? (
                        <TableBody aria-hidden="true">
                            {Array.from(
                                { length: skeletonRows },
                                (_, rowIndex) => (
                                    <TableRow
                                        key={rowIndex}
                                        className="border-b-0 hover:bg-transparent"
                                    >
                                        {table
                                            .getAllLeafColumns()
                                            .map((column, index) => {
                                                const meta =
                                                    column.columnDef.meta

                                                return (
                                                    <TableCell
                                                        key={column.id}
                                                        className={cn(
                                                            'h-auto border-b bg-card px-4 py-3 text-ui',
                                                            rowIndex ===
                                                                skeletonRows -
                                                                    1 &&
                                                                'border-b-0',
                                                            columnClasses(
                                                                meta,
                                                                index,
                                                            ),
                                                        )}
                                                    >
                                                        <div
                                                            className={cn(
                                                                'flex',
                                                                meta?.align ===
                                                                    'end'
                                                                    ? 'justify-end'
                                                                    : 'justify-start',
                                                            )}
                                                        >
                                                            {meta?.skeleton ?? (
                                                                // One line of text is 1.3 times the text size: this bar sits in one.
                                                                <div className="flex h-4.25 items-center">
                                                                    <Skeleton
                                                                        className={cn(
                                                                            skeletonBarClass,
                                                                            'h-3 w-20',
                                                                        )}
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                )
                                            })}
                                    </TableRow>
                                ),
                            )}
                        </TableBody>
                    ) : (
                        <TableBody className={dimmed}>
                            {rows.map((row) => (
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
                                                    meta?.rowHeader
                                                        ? 'row'
                                                        : undefined
                                                }
                                                className={cn(
                                                    // Controls other than the row link sit above its stretched hit area.
                                                    'h-auto border-b bg-card px-4 py-3 text-ui font-normal group-last/row:border-b-0 group-hover/row:bg-accent [&_a:not([data-slot=row-link])]:relative [&_a:not([data-slot=row-link])]:z-1 [&_button]:relative [&_button]:z-1',
                                                    columnClasses(meta, index),
                                                    meta?.stickyEnd &&
                                                        stickyEndRing,
                                                )}
                                            >
                                                <table.FlexRender cell={cell} />
                                            </Cell>
                                        )
                                    })}
                                </TableRow>
                            ))}
                        </TableBody>
                    )}
                </Table>
                {showEmpty ? empty : null}
                {footer && !showEmpty ? (
                    <div className={cn('border-t px-4 py-3', dimmed)}>
                        {footer}
                    </div>
                ) : null}
            </div>
        </TableBusyContext>
    )
}
