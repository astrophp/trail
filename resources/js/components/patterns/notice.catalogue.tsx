import { Notice } from '@/components/patterns/notice'
import { Button } from '@/components/ui/button'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Notice',
    specimens: [
        {
            name: 'Info',
            Component: () => (
                <Notice tone="info" title="A new version is available">
                    It will be used the next time the application restarts.
                </Notice>
            ),
        },
        {
            name: 'Warning, dismissible',
            Component: () => (
                <Notice
                    tone="warning"
                    title="Synchronisation is paused"
                    onDismiss={() => {}}
                >
                    Nothing new is being synchronised. What is already here
                    stays available.
                </Notice>
            ),
        },
        {
            name: 'Danger, with an action',
            Component: () => (
                <Notice
                    tone="danger"
                    title="The export failed"
                    action={
                        <Button variant="outline" size="sm">
                            Try again
                        </Button>
                    }
                >
                    The file could not be written.
                </Notice>
            ),
        },
        {
            name: 'Title only',
            Component: () => <Notice tone="info" title="Saved" />,
        },
    ],
}
