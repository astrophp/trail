import { SearchXIcon } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/patterns/empty-state'
import { Button } from '@/components/ui/button'
import { useTimeRangeLink } from '@/hooks/use-time-range'

/** A run that does not exist (or no longer does), with the way back to the list. */
export function TraceNotFound() {
    const linkTo = useTimeRangeLink()

    return (
        <EmptyState
            icon={SearchXIcon}
            title="Run not found"
            description="There is no recorded run with this id. It may have been pruned."
        >
            <Button asChild variant="outline" size="sm">
                <Link to={linkTo('/traces')}>Back to traces</Link>
            </Button>
        </EmptyState>
    )
}
