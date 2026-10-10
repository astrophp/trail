import { ArrowLeftIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { useBackLink } from '@/hooks/use-return-target'
import { cn } from '@/lib/utils'

/** The way back to the list the run was opened from, or to the bare list when it was not. */
export function BackLink({ className }: { className?: string }) {
    const { to, label } = useBackLink()

    return (
        <Button
            asChild
            variant="ghost"
            size="xs"
            className={cn('text-muted-foreground', className)}
        >
            <Link to={to}>
                <ArrowLeftIcon aria-hidden="true" />
                {label}
            </Link>
        </Button>
    )
}
