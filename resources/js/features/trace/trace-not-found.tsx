import { SearchXIcon } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/patterns/empty-state'
import { Button } from '@/components/ui/button'
import { useBackLink } from '@/hooks/use-return-target'

/** A run that does not exist, was pruned, or never was recorded, with the way back to the list. */
export function TraceNotFound() {
    const { to, label } = useBackLink()

    return (
        <EmptyState
            icon={SearchXIcon}
            title="Run not found"
            description="No recorded run has this id. It may have been pruned, or it was never recorded."
        >
            <Button asChild variant="outline" size="sm">
                <Link to={to}>{label}</Link>
            </Button>
        </EmptyState>
    )
}
