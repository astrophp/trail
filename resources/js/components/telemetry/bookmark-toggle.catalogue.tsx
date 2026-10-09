import { useState } from 'react'
import { BookmarkToggle } from '@/components/telemetry/bookmark-toggle'
import type { CatalogueEntry } from '@/catalogue/types'
import { cn } from '@/lib/utils'

/** The row surfaces a toggle sits on in the traces table. A selected row has no tint of its own. */
const surfaces = {
    plain: 'bg-card',
    // A hovered row is `accent`, and its outlines are at their clearest (`group-hover/row`).
    hovered: 'bg-accent [&_[data-slot=bookmark-toggle]]:text-faint',
} as const

function Specimen({
    initial,
    surface = 'plain',
    disabled = false,
}: {
    initial: boolean
    surface?: keyof typeof surfaces
    disabled?: boolean
}) {
    const [bookmarked, setBookmarked] = useState(initial)

    return (
        <div
            className={cn(
                'group/row flex w-fit rounded-md border px-4 py-2',
                surfaces[surface],
            )}
        >
            <BookmarkToggle
                trace={{
                    id: '019a3f2c-7b1e-7d4a-9c55-0e8f2a6b4d31',
                    name: 'SupportAssistant',
                    bookmarked,
                }}
                onPressedChange={setBookmarked}
                disabled={disabled}
            />
        </div>
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Bookmark toggle',
    specimens: [
        { name: 'Bookmarked', Component: () => <Specimen initial /> },
        {
            name: 'Not bookmarked',
            Component: () => <Specimen initial={false} />,
        },
        {
            name: 'Bookmarked, on a hovered row',
            Component: () => <Specimen initial surface="hovered" />,
        },
        {
            name: 'Not bookmarked, on a hovered row',
            Component: () => <Specimen initial={false} surface="hovered" />,
        },
        {
            name: 'Unavailable (aria-disabled, still focusable)',
            Component: () => <Specimen initial={false} disabled />,
        },
    ],
}
