import { createContext, useContext } from 'react'
import { parseBoot, type Boot } from '@/lib/boot'

export const BootContext = createContext<Boot>(parseBoot(undefined))

/** The boot object the app was started with. */
export function useBoot(): Boot {
    return useContext(BootContext)
}
