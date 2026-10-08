import { SearchXIcon } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/patterns/empty-state'
import { Button } from '@/components/ui/button'

/** A conversation that has no turns, was pruned, or whose address names none, with the way back to the list. */
export function TranscriptNotFound() {
    return (
        <EmptyState
            icon={SearchXIcon}
            title="This conversation was not found"
            description="No recorded turn has this conversation id. It may have been pruned, or it was never recorded."
        >
            <Button asChild variant="outline" size="sm">
                <Link to="/conversations">Back to Conversations</Link>
            </Button>
        </EmptyState>
    )
}
