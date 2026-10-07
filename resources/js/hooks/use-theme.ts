import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark' | 'system'

export type ThemeContextValue = {
    /** What the person chose. */
    theme: Theme
    /** What is applied right now: `system` resolved to the OS setting. */
    resolvedTheme: 'light' | 'dark'
    setTheme: (theme: Theme) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
    const context = useContext(ThemeContext)

    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider')
    }

    return context
}
