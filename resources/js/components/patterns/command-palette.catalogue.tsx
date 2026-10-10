import { BotIcon, FileTextIcon, ListTreeIcon } from 'lucide-react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import {
    CommandPalette,
    CommandPaletteFooter,
    CommandPaletteGroup,
    CommandPaletteHint,
    CommandPaletteInput,
    CommandPaletteItem,
    CommandPaletteLink,
    CommandPaletteList,
    CommandPaletteRow,
    CommandPaletteStatus,
} from '@/components/patterns/command-palette'
import { Button } from '@/components/ui/button'
import type { CatalogueEntry } from '@/catalogue/types'

type State = 'idle' | 'loading' | 'results' | 'empty' | 'failed' | 'long'

const pages = ['Overview', 'Traces', 'Conversations', 'Agents']

/** Opens the palette from a button, in the state to show: a dialog is modal, so one is open at a time. */
function Demo({ state }: { state: State }) {
    const [open, setOpen] = useState(false)
    const [value, setValue] = useState(
        state === 'idle' ? '' : state === 'empty' ? 'zzz' : 'order',
    )
    const count = state === 'long' ? 30 : 3

    return (
        <MemoryRouter>
            <Button variant="outline" onClick={() => setOpen(true)}>
                Open the palette
            </Button>
            <CommandPalette
                open={open}
                onOpenChange={setOpen}
                value={value}
                onValueChange={setValue}
                title="Command palette"
                description="Search, or go to a page."
                label="Search"
            >
                <CommandPaletteInput
                    placeholder="Search…"
                    aria-label="Search"
                />
                <CommandPaletteList label="Results">
                    <CommandPaletteGroup heading="Pages">
                        {pages.map((page) => (
                            <CommandPaletteItem key={page} value={page}>
                                <CommandPaletteRow
                                    icon={<ListTreeIcon />}
                                    meta="Page"
                                >
                                    {page}
                                </CommandPaletteRow>
                            </CommandPaletteItem>
                        ))}
                    </CommandPaletteGroup>
                    {state === 'results' || state === 'long' ? (
                        <CommandPaletteGroup heading="Runs">
                            {Array.from({ length: count }, (_, index) => (
                                <CommandPaletteItem
                                    key={index}
                                    value={`run-${index}`}
                                >
                                    <CommandPaletteLink
                                        to={`/traces/run-${index}`}
                                    >
                                        <CommandPaletteRow
                                            icon={<FileTextIcon />}
                                            meta={`019a3f2c…b7e${index}`}
                                        >
                                            Where is my order number {index}?
                                        </CommandPaletteRow>
                                    </CommandPaletteLink>
                                </CommandPaletteItem>
                            ))}
                        </CommandPaletteGroup>
                    ) : null}
                    {state === 'results' ? (
                        <CommandPaletteGroup heading="Agents">
                            <CommandPaletteItem value="agent-order">
                                <CommandPaletteLink to="/agents/agent?name=OrderAgent">
                                    <CommandPaletteRow
                                        icon={<BotIcon />}
                                        meta="4 runs"
                                    >
                                        OrderAgent
                                    </CommandPaletteRow>
                                </CommandPaletteLink>
                            </CommandPaletteItem>
                        </CommandPaletteGroup>
                    ) : null}
                </CommandPaletteList>
                <CommandPaletteStatus
                    spokenOnly={state === 'results' || state === 'long'}
                    action={
                        state === 'failed' ? (
                            <Button variant="outline" size="sm">
                                Try again
                            </Button>
                        ) : undefined
                    }
                >
                    {state === 'loading'
                        ? 'Searching…'
                        : state === 'empty'
                          ? 'Nothing matches “zzz”.'
                          : state === 'failed'
                            ? 'The search failed.'
                            : state === 'results' || state === 'long'
                              ? `${count} results for “order”.`
                              : undefined}
                </CommandPaletteStatus>
                <CommandPaletteFooter>
                    <CommandPaletteHint keys={['↑', '↓']}>
                        navigate
                    </CommandPaletteHint>
                    <CommandPaletteHint keys={['enter']}>
                        open
                    </CommandPaletteHint>
                    <span className="ml-auto">
                        Text matches from the last 24 hours.
                    </span>
                </CommandPaletteFooter>
            </CommandPalette>
        </MemoryRouter>
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Command palette',
    specimens: [
        {
            name: 'Idle (open it with the button)',
            Component: () => <Demo state="idle" />,
        },
        { name: 'Loading', Component: () => <Demo state="loading" /> },
        { name: 'Results', Component: () => <Demo state="results" /> },
        { name: 'No results', Component: () => <Demo state="empty" /> },
        {
            name: 'Failed, with a way to retry',
            Component: () => <Demo state="failed" />,
        },
        { name: 'Long list (scrolls)', Component: () => <Demo state="long" /> },
    ],
}
