import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CataloguePage } from '@/catalogue/catalogue-page'
import { locateEntries } from '@/catalogue/entries'
import type { CatalogueEntry } from '@/catalogue/types'
import './catalogue.css'

// Entries are discovered, not registered: any `name.catalogue.tsx` that
// exports `catalogue` shows up here.
const modules = import.meta.glob<{ catalogue: CatalogueEntry }>(
    '../components/**/*.catalogue.tsx',
    { eager: true },
)

const root = document.getElementById('catalogue')

if (root) {
    createRoot(root).render(
        <StrictMode>
            <CataloguePage entries={locateEntries(modules)} />
        </StrictMode>,
    )
}
