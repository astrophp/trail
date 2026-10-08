import { ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'
import { CappedText } from '@/components/patterns/capped-text'
import { Button } from '@/components/ui/button'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { formatCount } from '@/lib/format'
import {
    childChunk,
    cutPoint,
    entriesOf,
    isContainer,
    keyLimit,
    leafTextChunk,
    openDepth,
    wideContainer,
    type JsonValue,
} from '@/lib/json'
import { cn } from '@/lib/utils'

type PayloadNodeProps = {
    /** The key or index this value sits under; none for the top level. */
    name?: string
    value: JsonValue
    depth?: number
    redactionMarker: string
    /** Names the payload the top-level container belongs to, for its disclosure button's accessible name. */
    rootLabel?: string
}

function keyLabel(name: string, redactionMarker: string) {
    const end = cutPoint(name, keyLimit, redactionMarker)
    const cut = end < name.length

    return (
        <span
            data-slot="payload-key"
            title={cut ? name : undefined}
            className="shrink-0 text-primary-ink"
        >
            <CappedText
                text={cut ? `${name.slice(0, end)}…` : name}
                redactionMarker={redactionMarker}
                chunk={Number.POSITIVE_INFINITY}
            />
            <span className="text-muted-foreground">:</span>
        </span>
    )
}

function leafValue(
    value: Exclude<JsonValue, JsonValue[] | { [key: string]: JsonValue }>,
    redactionMarker: string,
) {
    if (typeof value === 'string') {
        return (
            <span className="min-w-0 text-chart-3">
                <span aria-hidden="true">&quot;</span>
                <CappedText
                    text={value}
                    redactionMarker={redactionMarker}
                    chunk={leafTextChunk}
                />
                <span aria-hidden="true">&quot;</span>
            </span>
        )
    }

    return (
        <span
            className={cn(
                'min-w-0',
                typeof value === 'number' ? 'text-chart-2' : 'text-chart-4',
            )}
        >
            {String(value)}
        </span>
    )
}

/**
 * One value of a payload tree, and under it its children. A container opens and closes; only the
 * first chunk of a long one is in the page, and the rest is a button away. A closed container
 * renders none of its children, so a deep or wide value costs only the levels that are open.
 */
export function PayloadNode({
    name,
    value,
    depth = 0,
    redactionMarker,
    rootLabel,
}: PayloadNodeProps) {
    const [limit, setLimit] = useState(childChunk)

    if (!isContainer(value)) {
        return (
            <div data-slot="payload-node" className="flex min-w-0 gap-1.5">
                {name === undefined ? null : keyLabel(name, redactionMarker)}
                {leafValue(value, redactionMarker)}
            </div>
        )
    }

    const isList = Array.isArray(value)
    const { entries: shown, total } = entriesOf(value, limit)
    const count = formatCount(total)
    const summary = isList ? `[${count}]` : `{${count}}`

    if (total === 0) {
        return (
            <div data-slot="payload-node" className="flex min-w-0 gap-1.5">
                {name === undefined ? null : keyLabel(name, redactionMarker)}
                <span className="text-muted-foreground">
                    {isList ? '[]' : '{}'}
                </span>
            </div>
        )
    }

    const remaining = total - shown.length
    const startsOpen =
        depth < openDepth && (depth === 0 || total <= wideContainer)
    const noun = isList
        ? total === 1
            ? 'item'
            : 'items'
        : total === 1
          ? 'entry'
          : 'entries'

    return (
        <Collapsible
            data-slot="payload-node"
            defaultOpen={startsOpen}
            className="min-w-0"
        >
            <CollapsibleTrigger
                aria-label={
                    rootLabel === undefined
                        ? undefined
                        : `${rootLabel}, ${isList ? 'array' : 'object'} with ${count} ${noun}`
                }
                className="group flex w-full min-w-0 items-center gap-1 rounded-sm text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
                <ChevronRightIcon
                    aria-hidden="true"
                    className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
                />
                {name === undefined ? null : keyLabel(name, redactionMarker)}
                <span className="text-muted-foreground">{summary}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="ml-1.5 flex min-w-0 flex-col gap-0.5 border-l pl-3">
                {shown.map(([key, child]) => (
                    <PayloadNode
                        key={key}
                        name={key}
                        value={child}
                        depth={depth + 1}
                        redactionMarker={redactionMarker}
                    />
                ))}
                {remaining > 0 ? (
                    <Button
                        type="button"
                        variant="link"
                        size="xs"
                        className="h-auto self-start p-0 font-sans"
                        onClick={() => setLimit(limit + childChunk)}
                    >
                        Show {formatCount(Math.min(remaining, childChunk))} more
                        ({formatCount(remaining)} left)
                    </Button>
                ) : null}
            </CollapsibleContent>
        </Collapsible>
    )
}
