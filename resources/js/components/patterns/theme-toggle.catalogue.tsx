import { ThemeToggle } from '@/components/patterns/theme-toggle'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Theme toggle',
    specimens: [{ name: 'Default', Component: () => <ThemeToggle /> }],
}
