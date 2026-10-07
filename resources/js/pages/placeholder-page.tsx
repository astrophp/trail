import { PageHeader } from '@/components/patterns/page-header'

/** Stands in for a page that is not built yet. */
export function PlaceholderPage({ title }: { title: string }) {
    return (
        <PageHeader title={title} description="This page is not built yet." />
    )
}
