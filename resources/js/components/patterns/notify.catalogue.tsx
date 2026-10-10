import { notify } from '@/components/patterns/notify'
import { Button } from '@/components/ui/button'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Notify (toasts)',
    specimens: [
        {
            name: 'Success is polite, an error is an alert (toasts appear at the top of the window)',
            Component: () => (
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => notify.success('Bookmark saved.')}
                    >
                        Show a success
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            notify.error('The bookmark could not be saved.')
                        }
                    >
                        Show an error
                    </Button>
                </div>
            ),
        },
    ],
}
