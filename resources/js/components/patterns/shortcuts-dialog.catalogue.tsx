import { useState } from 'react'
import {
    ShortcutsDialog,
    type ShortcutGroup,
} from '@/components/patterns/shortcuts-dialog'
import { Button } from '@/components/ui/button'
import type { CatalogueEntry } from '@/catalogue/types'

const groups: ShortcutGroup[] = [
    {
        id: 'page',
        heading: 'Lists',
        applies: true,
        rows: [
            { id: 'search', label: 'Search this list', keys: ['/'] },
            { id: 'next', label: 'Next row', keys: ['j'] },
            { id: 'previous', label: 'Previous row', keys: ['k'] },
        ],
    },
    {
        id: 'everywhere',
        heading: 'Everywhere',
        applies: true,
        rows: [
            { id: 'help', label: 'Show keyboard shortcuts', keys: ['?'] },
            { id: 'palette', label: 'Open the command palette', keys: ['⌘K'] },
            { id: 'go', label: 'Go to Traces', keys: ['g', 't'] },
        ],
    },
    {
        id: 'other',
        heading: 'Run page',
        rows: [
            { id: 'run-next', label: 'Next run', keys: ['j'] },
            {
                id: 'run-back',
                label: 'Back to where you came from',
                keys: ['g', 'b'],
            },
        ],
    },
]

/** The groups repeated, to be taller than the screen. */
const many: ShortcutGroup[] = Array.from({ length: 4 }, (_, copy) =>
    groups.map((group) => ({
        ...group,
        id: `${group.id}-${copy}`,
        rows: group.rows.map((row) => ({ ...row, id: `${row.id}-${copy}` })),
    })),
).flat()

/** Opens the dialog from a button: a dialog is modal, so one is open at a time. */
function Demo({ shown }: { shown: ShortcutGroup[] }) {
    const [open, setOpen] = useState(false)

    return (
        <>
            <Button variant="outline" onClick={() => setOpen(true)}>
                Open the shortcuts
            </Button>
            <ShortcutsDialog
                open={open}
                onOpenChange={setOpen}
                title="Keyboard shortcuts"
                description="Shortcuts do not work while you are typing in a field."
                groups={shown}
            />
        </>
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Shortcuts dialog',
    specimens: [
        {
            name: 'Groups, the ones that apply first',
            Component: () => <Demo shown={groups} />,
        },
        {
            name: 'Longer than the screen (the list scrolls, the Close button stays)',
            Component: () => <Demo shown={many} />,
        },
    ],
}
