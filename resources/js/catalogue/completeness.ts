const sharedComponent = /\/components\/(patterns|telemetry)\/.+\.tsx$/
const notAComponent = /\.(test|catalogue)\.tsx$/

/**
 * Returns the shared component files (under `components/patterns` and
 * `components/telemetry`) that have no `name.catalogue.tsx` next to them.
 */
export function missingCatalogueFiles(files: string[]): string[] {
    const present = new Set(files)

    return files
        .filter(
            (file) => sharedComponent.test(file) && !notAComponent.test(file),
        )
        .filter(
            (file) => !present.has(file.replace(/\.tsx$/, '.catalogue.tsx')),
        )
        .sort()
}
