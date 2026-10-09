import type { ReactNode } from 'react'
import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelEmpty } from '@/components/patterns/panel-empty'
import { PanelError } from '@/components/patterns/panel-error'
import { PanelHeader } from '@/components/patterns/panel-header'
import { PanelLoading } from '@/components/patterns/panel-loading'
import { RankedList } from '@/components/patterns/ranked-list'
import { cutText } from '@/features/agents/breakdown-words'
import { cn } from '@/lib/utils'

/** The rows of a list, and how many of them there are in all. */
export type BreakdownRows = {
    rows: ReactNode[]
    limit: { limit: number; total: number }
}

type BreakdownPanelProps = {
    title: string
    /** What an empty panel says: that nothing of this kind was called in the range. */
    emptyTitle: string
    /** What a screen reader is told while the rows are the previous range's. */
    busyLabel: string
    /** Nothing is known yet. */
    loading: boolean
    /** The rows are the previous range's, and shown until the next arrive. */
    busy: boolean
    /** It could not be loaded and there is nothing to show instead. */
    failure?: { message: string; onRetry: () => void }
    /** Of the agent's own runs; `undefined` for an agent that has none, whose panel is its delegated rows alone. */
    own?: BreakdownRows
    /** Inside the runs it was delegated to: no links and no share, since neither can be told. */
    delegated: BreakdownRows
    /** The word for what is listed, for the sentence about what own runs recorded. */
    noun: string
    className?: string
}

const nothingOfItsOwn = (noun: string) =>
    `Its own runs recorded no ${noun} in this range.`

/**
 * A ranked breakdown of what an agent's runs used, with its own states, so a failure or a slow
 * answer here leaves the rest of the page as it is. The agent's own rows link to the runs behind
 * them. Under them, when there are any, are the rows of the runs it was delegated to, as a quieter
 * list without links or bars: the traces list cannot filter on those, and there is no total to
 * take a part of. An agent with no runs of its own has only that list, as its main content.
 */
export function BreakdownPanel({
    title,
    emptyTitle,
    busyLabel,
    loading,
    busy,
    failure,
    own,
    delegated,
    noun,
    className,
}: BreakdownPanelProps) {
    const hasOwn = own !== undefined && own.rows.length > 0
    const hasDelegated = delegated.rows.length > 0
    const dimmed =
        busy && !loading && failure === undefined && (hasOwn || hasDelegated)
    const ownCut = own === undefined ? null : cutText(own.limit)
    const delegatedCut = cutText(delegated.limit)

    const body = () => {
        if (failure !== undefined) {
            return (
                <PanelError
                    title={`The ${noun}s could not be loaded`}
                    message={failure.message}
                    onRetry={failure.onRetry}
                />
            )
        }

        // An empty placeholder is the previous range's "nothing": it says nothing about this one.
        if (loading || (busy && !hasOwn && !hasDelegated)) {
            return <PanelLoading rows={3} />
        }

        if (!hasOwn && !hasDelegated) {
            return <PanelEmpty title={emptyTitle} />
        }

        return (
            <div className="flex flex-col gap-5">
                {own === undefined ? null : hasOwn ? (
                    <div className="flex flex-col gap-3">
                        <RankedList>{own.rows}</RankedList>
                        {ownCut === null ? null : (
                            <p className="text-caption text-muted-foreground">
                                {ownCut}
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-ui text-muted-foreground">
                        {nothingOfItsOwn(noun)}
                    </p>
                )}
                {hasDelegated ? (
                    <section
                        data-slot="delegated-rows"
                        className="flex flex-col gap-3 text-muted-foreground"
                    >
                        <div className="flex flex-col gap-1">
                            {own === undefined ? null : (
                                <h3 className="text-ui font-medium text-foreground">
                                    Inside its runs as a sub-agent
                                </h3>
                            )}
                            <p className="text-caption">
                                {own === undefined
                                    ? 'Counted inside the runs of the agents that delegated to it. '
                                    : null}
                                The traces list cannot filter on these, so they
                                have no links.
                            </p>
                        </div>
                        <RankedList>{delegated.rows}</RankedList>
                        {delegatedCut === null ? null : (
                            <p className="text-caption">{delegatedCut}</p>
                        )}
                    </section>
                ) : null}
            </div>
        )
    }

    return (
        <Panel className={className}>
            {/* Always mounted, so a change of its text is announced; outside the busy part, where it may be muted. */}
            <span role="status" className="sr-only">
                {dimmed ? busyLabel : ''}
            </span>
            <PanelHeader title={title} />
            <PanelContent
                aria-busy={dimmed ? true : undefined}
                className={cn(
                    'motion-safe:transition-opacity',
                    dimmed && 'opacity-60',
                )}
            >
                {body()}
            </PanelContent>
        </Panel>
    )
}
