import { createContext, useContext } from 'react'

export type PaletteControls = {
    open: boolean
    /** Opens the palette, or closes it when it is open. */
    toggle: () => void
    /** Opens it; `from` is what to return focus to when it closes, for a click that did not focus its button. */
    show: (from?: HTMLElement) => void
}

export const PaletteContext = createContext<PaletteControls | null>(null)

/** Opens the palette from anywhere inside a `PaletteProvider`. */
export function usePalette(): PaletteControls {
    const controls = useContext(PaletteContext)

    if (controls === null) {
        throw new Error('usePalette must be used within a PaletteProvider.')
    }

    return controls
}
