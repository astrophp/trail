import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ErrorState } from '@/components/patterns/error-state'
import { LoadedTranscript } from '@/features/conversations/loaded-transcript'
import { TranscriptHeader } from '@/features/conversations/transcript-header'
import { TranscriptNotFound } from '@/features/conversations/transcript-not-found'
import { TranscriptSkeleton } from '@/features/conversations/transcript-skeleton'
import { useTranscript } from '@/features/conversations/use-transcript'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { usePageTitle } from '@/hooks/use-page-title'
import { useShortcuts } from '@/hooks/use-shortcuts'
import { conversationIdText } from '@/lib/conversation-id'
import { navPage } from '@/lib/nav-pages'
import { cn } from '@/lib/utils'

type TranscriptViewProps = {
    /** The conversation's id, as the address carries it; empty when it carries none. */
    id: string
    /** Whether the tool calls of each turn are shown. */
    tools: boolean
    onToolsChange: (tools: boolean) => void
    /** The turn the address names, by run id; empty for none. */
    turn: string
    /** Writes the turn the reader is at to the address, replacing its entry; empty drops it. */
    onTurnChange: (turn: string) => void
    className?: string
}

/**
 * One conversation as a dialogue: the turns ending at the one the address names (the newest turns
 * without one), earlier and later ones on request. Loads the conversation itself, and says so
 * when it is loading, could not be loaded, or does not exist (an address without an id included,
 * which asks for nothing). A conversation keeps nothing of the one before it.
 */
export function TranscriptView({ id, ...props }: TranscriptViewProps) {
    return <Transcript key={id} id={id} {...props} />
}

function Transcript({
    id,
    tools,
    onToolsChange,
    turn,
    onTurnChange,
    className,
}: TranscriptViewProps) {
    // The window is chosen by the turn the page was opened on. A turn written later, by the page
    // itself, is somewhere in what is loaded and loads nothing.
    const [anchor, setAnchor] = useState(turn)
    const transcript = useTranscript(id, anchor)
    const navigate = useNavigate()

    // The breadcrumb's "Conversations": a conversation is opened from the list without a way back
    // to carry, so the way back is the list itself.
    useShortcuts({
        'conversation-back': () => void navigate(navPage('conversations').path),
    })
    const { conversation } = transcript
    // The id the response returns is the conversation's own spelling; until then, the address's.
    const shownId = conversation?.id ?? id
    const ready = conversation !== undefined && !transcript.notFound
    // Back or Forward to a turn the loaded turns do not hold: the window ending at it is loaded.
    const elsewhere =
        ready &&
        turn !== '' &&
        turn !== anchor &&
        !transcript.turns.some((item) => item.turn.trace.id === turn)

    if (elsewhere) {
        setAnchor(turn)
    }

    // The breadcrumb and the tab are called after the conversation while it is there to show.
    usePageTitle(
        ready || transcript.loading || transcript.failed
            ? `Conversation ${conversationIdText(shownId)}`
            : null,
    )
    // The control that had focus (a retry, the way back) goes away when the page loads.
    useFocusHandoff(transcript.failed || transcript.notFound)

    return (
        <div
            data-slot="transcript-view"
            className={cn('flex flex-col gap-6', className)}
        >
            {transcript.notFound ? (
                <TranscriptHeader id={shownId} />
            ) : (
                <TranscriptHeader id={shownId} conversation={conversation} />
            )}
            {transcript.notFound ? (
                <TranscriptNotFound />
            ) : ready ? (
                <LoadedTranscript
                    // The window the page opened on is the page's: a new one starts it afresh.
                    key={anchor}
                    conversation={conversation}
                    turns={transcript.turns}
                    earlier={{
                        count: transcript.older,
                        loading: transcript.loadingEarlier,
                        failure: transcript.earlierFailure,
                        onLoad: transcript.loadEarlier,
                    }}
                    later={{
                        count: transcript.newer,
                        loading: transcript.loadingLater,
                        failure: transcript.laterFailure,
                        onLoad: transcript.loadLater,
                    }}
                    tools={tools}
                    onToolsChange={onToolsChange}
                    turn={turn}
                    missing={
                        transcript.missing !== null &&
                        transcript.missing === turn
                    }
                    onTurnChange={onTurnChange}
                    refreshing={transcript.refreshing}
                    refreshFailed={transcript.refreshFailed}
                    onRetryRefresh={transcript.retryRefresh}
                />
            ) : transcript.failed ? (
                <ErrorState
                    title="The conversation could not be loaded"
                    error={transcript.error}
                    onRetry={transcript.retry}
                    retrying={transcript.retrying}
                />
            ) : (
                <TranscriptSkeleton />
            )}
        </div>
    )
}
