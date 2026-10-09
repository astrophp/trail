import { ChevronRightIcon } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import type { AttentionItem } from '@/api/types'
import { CountChip } from '@/components/patterns/count-chip'
import { RowLink } from '@/components/patterns/row-link'
import { IssueLabel } from '@/components/telemetry/issue-label'
import { Timestamp } from '@/components/telemetry/timestamp'
import { attentionWording } from '@/features/overview/attention-wording'
import { tracesLinkFor } from '@/features/overview/traces-link'
import type { TimeRangePreset } from '@/lib/time-range'
import { cn } from '@/lib/utils'

type AttentionRowProps = {
    item: AttentionItem
    /** The range the item was counted over: its link opens the list over the same one. */
    range: TimeRangePreset
    className?: string
}

/**
 * One kind of run that needs a look: what it is, how many, when the latest started, and the whole
 * row is a link to those runs. A failed item lists its issue kinds beneath, each a link of its
 * own. The kinds can add up to less than the item's count (a failed run may have none), so no
 * total of them is drawn and nothing stands in for the rest.
 */
export function AttentionRow({ item, range, className }: AttentionRowProps) {
    const { title, describe, Icon, tone } = attentionWording(item.kind)
    const detailId = useId()

    return (
        <li
            data-slot="attention-row"
            className={cn(
                'relative flex gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0',
                className,
            )}
        >
            <Icon
                aria-hidden="true"
                className={cn('mt-0.5 size-4 shrink-0', tone)}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <RowLink
                    to={tracesLinkFor(range, item.filters)}
                    aria-describedby={detailId}
                    className="w-fit text-ui"
                >
                    {title}
                </RowLink>
                <div
                    id={detailId}
                    className="text-caption text-muted-foreground"
                >
                    <p>{describe(item.count)}</p>
                    {item.latest_at === null ? null : (
                        <p>
                            Latest run{' '}
                            <Timestamp at={item.latest_at} layout="inline" />
                        </p>
                    )}
                </div>
                {item.breakdown.length === 0 ? null : (
                    <ul
                        aria-label={`${title} by issue`}
                        className="mt-1 flex flex-wrap gap-x-3 gap-y-1"
                    >
                        {item.breakdown.map((row) => (
                            <li key={row.issue_kind}>
                                <Link
                                    to={tracesLinkFor(range, row.filters)}
                                    className="relative z-10 inline-flex items-center gap-1.5 rounded-sm text-caption text-muted-foreground outline-none hover:text-primary-ink hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                                >
                                    <IssueLabel kind={row.issue_kind} />
                                    <CountChip count={row.count} />
                                </Link>
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
