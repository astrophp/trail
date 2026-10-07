import { describe, expect, it } from 'vitest'
import { missingCatalogueFiles } from '@/catalogue/completeness'

describe('missingCatalogueFiles', () => {
    it('reports a shared component without a catalogue file, by path', () => {
        const files = [
            '../components/patterns/page-header.tsx',
            '../components/patterns/page-header.catalogue.tsx',
            '../components/patterns/data-table.tsx',
            '../components/telemetry/cost.tsx',
            '../components/telemetry/cost.test.tsx',
        ]

        expect(missingCatalogueFiles(files)).toEqual([
            '../components/patterns/data-table.tsx',
            '../components/telemetry/cost.tsx',
        ])
    })

    it('ignores tests, catalogue files and layers that need no catalogue file', () => {
        const files = [
            '../components/patterns/page-header.catalogue.tsx',
            '../components/patterns/page-header.test.tsx',
            '../components/ui/button.tsx',
            '../features/traces/trace-list.tsx',
        ]

        expect(missingCatalogueFiles(files)).toEqual([])
    })
})

describe('the component tree', () => {
    it('has a catalogue file for every shared component', () => {
        const files = Object.keys(
            import.meta.glob([
                '../components/patterns/**/*.tsx',
                '../components/telemetry/**/*.tsx',
            ]),
        )

        expect(
            missingCatalogueFiles(files),
            'Add a name.catalogue.tsx next to each of these components',
        ).toEqual([])
    })
})
