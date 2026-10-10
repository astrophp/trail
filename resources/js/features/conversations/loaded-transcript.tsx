import { useCallback, useLayoutEffect, useRef } from 'react'
import type { Conversation } from '@/api/types'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Notice } from '@/components/patterns/notice'
import { ActivitySpan } from '@/features/conversations/activity-span'
import { MoreTurns } from '@/features/conversations/more-turns'
import { RefreshNote } from '@/features/conversations/refresh-note'
import { TranscriptSide } from '@/features/conversations/transcript-side'
import { transcriptParams } from '@/features/conversations/transcript-params'
import {
    turnHeadingDomId,
    type NumberedTurn,
} from '@/features/conversations/transcript-turns'
import { TurnItem } from '@/features/conversations/turn-item'
import { usePrependAnchor } from '@/features/conversations/use-prepend-anchor'
import { useTurnArrival } from '@/features/conversations/use-turn-arrival'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { transcriptPath } from '@/lib/conversation-path'
import { formatCount } from '@/lib/format'
import type { Refreshing } from '@/lib/refresh-policy'
import { returnTo } from '@/lib/return-context'
import { writeState } from '@/lib/url-state'

/** One side's turns that are not loaded: how many, and what a load of them is doing. */
export type MoreSide = {
    count: number
    loading: boolean
    failure: { error: unknown } | null
    /** Resolves to whether the turns arrived. */
    onLoad: () => Promise<boolean>
}

type LoadedTranscriptProps = {
    conversation: Conversation
    turns: NumberedTurn[]
    earlier: MoreSide
    later: MoreSide
    tools: boolean
    onToolsChange: (tools: boolean) => void
    /** The turn the address names, by run id; empty for none. */
    turn: string
    /** The address names a turn the conversation does not have (any more). */
    missing: boolean
    /** Writes the turn the reader is at to the address (replacing the entry); empty drops it. */
    onTurnChange: (turn: string) => void
    refreshing: Refreshing
    refreshFailed: boolean
    onRetryRefresh: () => void
}

/**
 * The conversation read top to bottom: a line over it (how many turns were recorded, when, and
 * the "Show tools" switch), the turns, and a sentence saying what the page is. The transcript comes
 * first in the document, so reading and tab order follow it; below the wide breakpoint the side
 * column is ordered above it.
 */
export function LoadedTranscript({
    conversation,
    turns,
    earlier,
    later,
    tools,
    onToolsChange,
    turn,
    missing,
    onTurnChange,
    refreshing,
    refreshFailed,
    onRetryRefresh,
}: LoadedTranscriptProps) {
    const { remember, forget } = usePrependAnchor(turns[0]?.turn.trace.id)
    const { marked, arrive, settle } = useTurnArrival(turn)
    const all = conversation.turns.all
    const noteShown = missing && turn !== ''
    // The dismiss button goes away with the notice: focus must not fall to the page.
    useFocusHandoff(noteShown)

    // The conversation's page at a turn: the way back from that turn's links, and its own link.
    const pagePath = useCallback(
        (traceId: string) =>
            returnTo(
                transcriptPath,
                writeState(transcriptParams, new URLSearchParams(), {
                    id: conversation.id,
                    tools,
                    turn: traceId,
                }).toString(),
            ),
        [conversation.id, tools],
    )

    function loadEarlier() {
        if (turns.length > 0) {
            remember(turns[0].turn.trace.id)
        }

        void earlier.onLoad().then(
            (loaded) => {
                if (!loaded) {
                    forget()
                }
            },
            () => forget(),
        )
    }

    // Turns put after the last one leave the reader where they are; focus goes to the first of them.
    const lastId = turns.at(-1)?.turn.trace.id
    const heldLast = useRef<string | null>(null)

    function loadLater() {
        heldLast.current = lastId ?? null

        void later.onLoad().then(
            (loaded) => {
                if (!loaded) {
                    heldLast.current = null
                }
            },
            () => {
                heldLast.current = null
            },
        )
    }

    useLayoutEffect(() => {
        const held = heldLast.current

        if (held === null || lastId === held) {
            return
        }

        heldLast.current = null

        const index = turns.findIndex((item) => item.turn.trace.id === held)
        const first = turns[index + 1]

        if (index !== -1 && first) {
            document
                .getElementById(turnHeadingDomId(first.turn.trace.id))
                ?.focus()
        }
    }, [lastId, turns])

    // Following a link from a turn: this entry records the turn, so Back comes to the same place.
    function visit(traceId: string) {
        settle(traceId)
        onTurnChange(traceId)
    }

    function jump(traceId: string) {
        arrive(traceId)
        // A jump within the page is not a place to come back to: Back leaves the page.
        onTurnChange(traceId)
    }

    return (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-10">
            <section aria-label="Transcript" className="min-w-0">
                {noteShown ? (
                    <Notice
                        tone="info"
                        title="That turn is no longer recorded."
                        onDismiss={() => onTurnChange('')}
                        dismissLabel="Dismiss this note"
                        className="mb-6"
                    >
                        The newest turns are shown instead.
                    </Notice>
                ) : null}
                <RefreshNote
                    refreshing={refreshing}
                    failed={refreshFailed}
                    onRetry={onRetryRefresh}
                />
                <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-ui text-muted-foreground">
                    <p className="flex flex-wrap items-center gap-x-2">
                        <span>
                            {formatCount(all)} recorded{' '}
                            {all === 1 ? 'turn' : 'turns'}
                        </span>
                        <span aria-hidden="true">{'·'}</span>
                        <ActivitySpan
                            from={conversation.first_activity_at}
                            to={conversation.last_activity_at}
                        />
                    </p>
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="transcript-tools"
                            checked={tools}
                            onCheckedChange={(checked) =>
                                onToolsChange(checked === true)
                            }
                        />
                        <Label
                            htmlFor="transcript-tools"
                            className="text-ui font-normal text-foreground"
                        >
                            Show tools
                        </Label>
                    </div>
                </div>
                <MoreTurns
                    direction="earlier"
                    count={earlier.count}
                    loading={earlier.loading}
                    failure={earlier.failure}
                    onLoad={loadEarlier}
                    className="pb-6"
                />
                <div>
                    {turns.map(({ turn: item, number }) => (
                        <TurnItem
                            key={item.trace.id}
                            turn={item}
                            number={number}
                            tools={tools}
                            pagePath={pagePath(item.trace.id)}
                            marked={marked === item.trace.id}
                            onVisit={() => visit(item.trace.id)}
                        />
                    ))}
                </div>
                <MoreTurns
                    direction="later"
                    count={later.count}
                    loading={later.loading}
                    failure={later.failure}
                    onLoad={loadLater}
                    className="pt-6 pb-6"
                />
                <p className="border-t pt-4 text-ui text-muted-foreground">
                    This page shows what was stored for each turn. Messages a
                    turn resent from earlier in the conversation are left out.
                </p>
            </section>
            <aside
                aria-label="About this conversation"
                className="order-first min-w-0 lg:order-none lg:w-64 lg:border-s lg:ps-6"
            >
                <TranscriptSide
                    conversation={conversation}
                    turns={turns}
                    onJump={jump}
                />
            </aside>
        </div>
    )
}
