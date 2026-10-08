import { TranscriptView, transcriptParams } from '@/features/conversations'
import { useUrlState } from '@/hooks/use-url-state'

/**
 * One conversation: its id, the "Show tools" switch and the turn the reader is at are the
 * address's.
 */
export function ConversationPage() {
    const [{ id, tools, turn }, setParams] = useUrlState(transcriptParams)

    return (
        <TranscriptView
            id={id}
            tools={tools}
            turn={turn}
            // A display switch is not a place to go back to.
            onToolsChange={(next) =>
                setParams({ tools: next }, { replace: true })
            }
            // Nor is moving about the page: Back leaves it.
            onTurnChange={(next) =>
                setParams({ turn: next }, { replace: true })
            }
        />
    )
}
