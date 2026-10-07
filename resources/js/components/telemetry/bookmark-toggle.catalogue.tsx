import { useState } from 'react'
import { BookmarkToggle } from '@/components/telemetry/bookmark-toggle'
import type { CatalogueEntry } from '@/catalogue/types'

function Specimen({
    initial,
    disabled = false,
}: {
    initial: boolean
    disabled?: boolean
}) {
    const [bookmarked, setBookmarked] = useState(initial)

    return (
        <BookmarkToggle
            trace={{
                id: '019a3f2c-7b1e-7d4a-9c55-0e8f2a6b4d31',
                name: 'SupportAssistant',
                bookmarked,
            }}
            onPressedChange={setBookmarked}
            disabled={disabled}
        />
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
            name: 'Unavailable (aria-disabled, still focusable)',
            Component: () => <Specimen initial={false} disabled />,
        },
    ],
}
