import { ChevronRightIcon, CircleAlertIcon } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import { CountChip } from '@/components/patterns/count-chip'
import { RowLink } from '@/components/patterns/row-link'
import { IssueLabel } from '@/components/telemetry/issue-label'
import { Timestamp } from '@/components/telemetry/timestamp'
import type { AttentionEntry } from '@/features/overview/attention-items'
import { attentionWording } from '@/features/overview/attention-wording'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

const cell =
    'relative flex gap-3 rounded-md border px-3 py-2.5 hover:bg-muted/50'

/**
 * One kind of run that needs a look, compact: an icon, the title, and one line with the count and
 * when the latest run began; the whole cell is a link to those runs. A failed item lists its issue
 * kinds beneath, each a link of its own. The kinds can add up to less than the item's count (a
 * failed run may have none), so no total of them is drawn and nothing stands in for the rest.
 *
 * An entry this client cannot word or link is a cell that says so, with what the API called it
 * and its count, and no link.
 */
export function AttentionCell({
    entry,
    className,
}: {
    entry: AttentionEntry
    className?: string
}) {
    const detailId = useId()

    if (!entry.readable) {
        return (
            <li
                data-slot="attention-cell"
                data-readable="false"
                className={cn(cell, 'hover:bg-transparent', className)}
            >
                <CircleAlertIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-ui wrap-anywhere">{entry.kind}</span>
                    <p className="text-caption text-muted-foreground">
                        {formatCount(entry.count)} · This item could not be
                        shown.
                    </p>
                </div>
            </li>
        )
    }

    const { item } = entry
    const { title, describe, Icon, tone } = attentionWording(entry.kind)

    return (
        <li data-slot="attention-cell" className={cn(cell, className)}>
            <Icon
                aria-hidden="true"
                className={cn('mt-0.5 size-4 shrink-0', tone)}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <RowLink
                    to={entry.to}
                    aria-describedby={detailId}
                    className="w-fit text-ui"
                >
                    {title}
                </RowLink>
                <p id={detailId} className="text-caption text-muted-foreground">
                    <span>{describe(item.count)}</span>
                    {item.latest_at === null ? null : (
                        <>
                            {' · latest '}
                            <Timestamp at={item.latest_at} layout="relative" />
                        </>
                    )}
                </p>
                {entry.breakdown.length === 0 ? null : (
                    // Safari drops the list semantics of a list whose markers a reset removes.
                    // eslint-disable-next-line jsx-a11y/no-redundant-roles
                    <ul
                        role="list"
                        aria-label={`${title} by issue`}
                        className="mt-1 flex flex-wrap gap-x-3 gap-y-1"
                    >
                        {entry.breakdown.map((row) => (
                            <li key={row.issueKind}>
                                {row.readable ? (
                                    <Link
                                        to={row.to}
                                        className="relative z-10 inline-flex items-center gap-1.5 rounded-sm text-caption text-muted-foreground outline-none hover:text-primary-ink hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                                    >
                                        <IssueLabel kind={row.issueKind} />
                                        <span aria-hidden="true">
                                            <CountChip count={row.row.count} />
                                        </span>
                                        <span className="sr-only">
                                            {`, ${formatCount(row.row.count)} failed`}
                                        </span>
                                    </Link>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
                                        <span className="wrap-anywhere">
                                            {row.issueKind}
                                        </span>
                                        <CountChip count={row.count} />
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <ChevronRightIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-faint"
            />
        </li>
    )
}
