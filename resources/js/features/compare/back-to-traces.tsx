import { ArrowLeftIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { useBackLink } from '@/hooks/use-return-target'

/** The way back to the list the comparison was started from, or to the bare list. */
export function BackToTraces() {
    const { to, label } = useBackLink()

    return (
        <Button asChild variant="ghost" size="sm">
            <Link to={to}>
                <ArrowLeftIcon aria-hidden="true" />
                {label}
            </Link>
        </Button>
    )
}
