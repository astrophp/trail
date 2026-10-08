import type { Conversation } from '@/api/types'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ActivitySpan } from '@/features/conversations/activity-span'
import { EarlierTurns } from '@/features/conversations/earlier-turns'
import { TranscriptSide } from '@/features/conversations/transcript-side'
import {
    turnDomId,
    turnHeadingDomId,
    type NumberedTurn,
} from '@/features/conversations/transcript-turns'
import { TurnItem } from '@/features/conversations/turn-item'
import { usePrependAnchor } from '@/features/conversations/use-prepend-anchor'
import { formatCount } from '@/lib/format'

type LoadedTranscriptProps = {
    conversation: Conversation
    turns: NumberedTurn[]
    older: number
    tools: boolean
    onToolsChange: (tools: boolean) => void
    loadingEarlier: boolean
    earlierFailure: { error: unknown } | null
    onLoadEarlier: () => Promise<boolean>
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
    older,
    tools,
    onToolsChange,
    loadingEarlier,
    earlierFailure,
    onLoadEarlier,
}: LoadedTranscriptProps) {
    const { remember, forget } = usePrependAnchor(turns[0]?.turn.trace.id)
    const all = conversation.turns.all

    function loadEarlier() {
        if (turns.length > 0) {
            remember(turns[0].turn.trace.id)
        }

        void onLoadEarlier().then(
            (loaded) => {
                if (!loaded) {
                    forget()
                }
            },
            () => forget(),
        )
    }

    function jump(traceId: string) {
        document
            .getElementById(turnDomId(traceId))
            ?.scrollIntoView({ block: 'start' })
        document
            .getElementById(turnHeadingDomId(traceId))
            ?.focus({ preventScroll: true })
    }

    return (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-10">
            <section aria-label="Transcript" className="min-w-0">
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
                <EarlierTurns
                    older={older}
                    loading={loadingEarlier}
                    failure={earlierFailure}
                    onLoad={loadEarlier}
                />
                <div>
                    {turns.map(({ turn, number }) => (
                        <TurnItem
                            key={turn.trace.id}
                            turn={turn}
                            number={number}
                            tools={tools}
                        />
                    ))}
                </div>
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
