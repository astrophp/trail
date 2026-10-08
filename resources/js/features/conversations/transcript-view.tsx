import { ErrorState } from '@/components/patterns/error-state'
import { LoadedTranscript } from '@/features/conversations/loaded-transcript'
import { conversationIdText } from '@/features/conversations/conversation-id'
import { TranscriptHeader } from '@/features/conversations/transcript-header'
import { TranscriptNotFound } from '@/features/conversations/transcript-not-found'
import { TranscriptSkeleton } from '@/features/conversations/transcript-skeleton'
import { useTranscript } from '@/features/conversations/use-transcript'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { usePageTitle } from '@/hooks/use-page-title'
import { cn } from '@/lib/utils'

type TranscriptViewProps = {
    /** The conversation's id, as the address carries it; empty when it carries none. */
    id: string
    /** Whether the tool calls of each turn are shown. */
    tools: boolean
    onToolsChange: (tools: boolean) => void
    className?: string
}

/**
 * One conversation as a dialogue: the newest turns first loaded, earlier ones on request. Loads
 * the conversation itself, and says so when it is loading, could not be loaded, or does not exist
 * (an address without an id included, which asks for nothing).
 */
export function TranscriptView({
    id,
    tools,
    onToolsChange,
    className,
}: TranscriptViewProps) {
    const transcript = useTranscript(id)
    const { conversation } = transcript
    // The id the response returns is the conversation's own spelling; until then, the address's.
    const shownId = conversation?.id ?? id
    const ready = conversation !== undefined && !transcript.notFound

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
                    // A conversation keeps nothing of the one before it.
                    key={conversation.id}
                    conversation={conversation}
                    turns={transcript.turns}
                    older={transcript.older}
                    tools={tools}
                    onToolsChange={onToolsChange}
                    loadingEarlier={transcript.loadingEarlier}
                    earlierFailure={transcript.olderFailure}
                    onLoadEarlier={transcript.loadEarlier}
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
