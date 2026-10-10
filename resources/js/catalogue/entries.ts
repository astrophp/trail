import type { CatalogueEntry } from '@/catalogue/types'

export const layers = ['telemetry', 'patterns', 'ui'] as const

export type CatalogueLayer = (typeof layers)[number]

export type LocatedEntry = CatalogueEntry & {
    /** Unique, taken from the file path. */
    id: string
    /** Taken from the folder the file lives in. */
    layer: CatalogueLayer
}

/** Turns `{ path: module }` (as `import.meta.glob` returns it) into entries, ordered by layer and title. */
export function locateEntries(
    modules: Record<string, { catalogue: CatalogueEntry }>,
): LocatedEntry[] {
    return Object.entries(modules)
        .flatMap(([path, { catalogue }]) => {
            const match =
                /\/components\/(ui|patterns|telemetry)\/(.+)\.catalogue\.tsx$/.exec(
                    path,
                )

            if (!match) {
                throw new Error(
                    `${path} must live under components/ui, patterns or telemetry`,
                )
            }

            return {
                ...catalogue,
                layer: match[1] as CatalogueLayer,
                id: `${match[1]}-${match[2].replace(/[^a-z0-9]+/gi, '-')}`,
            }
        })
        .sort(
            (a, b) =>
                layers.indexOf(a.layer) - layers.indexOf(b.layer) ||
                a.title.localeCompare(b.title),
        )
}
