import type { ComponentType } from 'react'

/** A specimen is a component, so it can hold state (for example to control another component). */
export type CatalogueSpecimen = {
    name: string
    Component: ComponentType
}

/** What a `name.catalogue.tsx` file exports as `catalogue`. */
export type CatalogueEntry = {
    title: string
    specimens: CatalogueSpecimen[]
}
