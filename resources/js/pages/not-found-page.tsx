import { Link } from 'react-router'
import { PageHeader } from '@/components/patterns/page-header'

export function NotFoundPage() {
    return (
        <>
            <PageHeader
                title="Page not found"
                description="There is nothing at this address."
            />
            <p className="mt-4 text-ui">
                <Link
                    to="/"
                    className="text-primary-ink underline-offset-4 hover:underline"
                >
                    Back to the overview
                </Link>
            </p>
        </>
    )
}
