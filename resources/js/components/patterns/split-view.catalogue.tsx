import { useState } from 'react'
import { SplitView } from '@/components/patterns/split-view'
import { Button } from '@/components/ui/button'
import type { CatalogueEntry } from '@/catalogue/types'

const lines = Array.from({ length: 24 }, (_, i) => `Item ${i + 1}`)

function Demo({ initiallyOpen, id }: { initiallyOpen: boolean; id: string }) {
    const [open, setOpen] = useState(initiallyOpen)

    return (
        <div className="h-72 rounded-lg border">
            <SplitView
                className="h-full"
                storageKey={`catalogue.split-view.${id}`}
                primaryLabel="Items"
                secondaryLabel="Item details"
                detailOpen={open}
                onBack={() => setOpen(false)}
                backLabel="Back to items"
                primary={
                    <div className="flex flex-col items-start gap-2 p-3 text-ui">
                        <Button size="sm" onClick={() => setOpen(true)}>
                            Open the detail
                        </Button>
                        {lines.map((line) => (
                            <p key={line}>{line}</p>
                        ))}
                    </div>
                }
                secondary={
                    <div className="flex flex-col gap-2 p-3 text-ui">
                        <p>The details of one item.</p>
                        {lines.map((line) => (
                            <p key={line} className="text-muted-foreground">
                                {line} detail
                            </p>
                        ))}
                    </div>
                }
            />
        </div>
    )
}

// The panes switch to one at a time with the window width (the md breakpoint), not with a prop, so
// the single-pane specimens show it only in a narrow window; in a wide one they show the divider.
export const catalogue: CatalogueEntry = {
    title: 'Split view',
    specimens: [
        {
            name: 'Two panes with a full-height divider, scrolling inside each (windows at or above the md breakpoint)',
            Component: () => <Demo initiallyOpen={false} id="wide" />,
        },
        {
            name: 'Single pane, list shown (windows below the md breakpoint; wide windows show the split)',
            Component: () => <Demo initiallyOpen={false} id="single-list" />,
        },
        {
            name: 'Single pane, detail shown with a back action (windows below the md breakpoint; wide windows show the split)',
            Component: () => <Demo initiallyOpen={true} id="single-detail" />,
        },
    ],
}
