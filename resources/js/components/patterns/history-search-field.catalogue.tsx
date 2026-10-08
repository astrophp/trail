import { useRef } from 'react'
import { BrowserRouter, useNavigate, useSearchParams } from 'react-router'
import { HistorySearchField } from '@/components/patterns/history-search-field'
import type { CatalogueEntry } from '@/catalogue/types'

/** Holds the search the way a page does: in the router's search, so Back and Forward work. */
function Specimen() {
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const input = useRef<HTMLInputElement>(null)
    const value = params.get('q') ?? ''

    return (
        <div className="flex flex-col gap-2 text-ui">
            <HistorySearchField
                aria-label="Search fruit"
                placeholder="Search fruit"
                value={value}
                inputRef={input}
                onCommit={(q, options) =>
                    void navigate({ search: q ? `?q=${q}` : '' }, options)
                }
            />
            <p className="text-muted-foreground">
                Committed: {value === '' ? 'nothing' : value}
            </p>
            <div className="flex gap-2">
                <button className="underline" onClick={() => void navigate(-1)}>
                    Back
                </button>
                <button className="underline" onClick={() => void navigate(1)}>
                    Forward
                </button>
            </div>
        </div>
    )
}

// The browser's own history, as on a page: the component reads the entry's key from it, so a
// memory router would not show its session behaviour. The search lives in this page's `q` param,
// which is why there is one specimen.
export const catalogue: CatalogueEntry = {
    title: 'History search field',
    specimens: [
        {
            name: 'In the URL (type, then pause, press Enter or leave the box to commit; Back and Forward move through the searches)',
            Component: () => (
                <BrowserRouter>
                    <Specimen />
                </BrowserRouter>
            ),
        },
    ],
}
