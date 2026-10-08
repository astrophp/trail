import { TranscriptView, transcriptParams } from '@/features/conversations'
import { useUrlState } from '@/hooks/use-url-state'

/** One conversation: its id and the "Show tools" switch are the address's. */
export function ConversationPage() {
    const [{ id, tools }, setParams] = useUrlState(transcriptParams)

    return (
        <TranscriptView
            id={id}
            tools={tools}
            // A display switch is not a place to go back to.
            onToolsChange={(next) =>
                setParams({ tools: next }, { replace: true })
            }
        />
    )
}
