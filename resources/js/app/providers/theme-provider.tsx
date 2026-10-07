import { useEffect, useState, type ReactNode } from 'react'
import { ThemeContext, type Theme } from '@/hooks/use-theme'

const storageKey = 'trail-theme'
const darkQuery = '(prefers-color-scheme: dark)'

// The layout's inline script reads the same key before first paint and treats
// anything other than 'light' or 'dark' as the system setting.
function readStoredTheme(): Theme {
    try {
        const stored = localStorage.getItem(storageKey)

        return stored === 'light' || stored === 'dark' ? stored : 'system'
    } catch {
        return 'system'
    }
}

function systemPrefersDark(): boolean {
    return window.matchMedia(darkQuery).matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(readStoredTheme)
    const [systemDark, setSystemDark] = useState(systemPrefersDark)

    useEffect(() => {
        const query = window.matchMedia(darkQuery)
        const onChange = (event: MediaQueryListEvent) =>
            setSystemDark(event.matches)

        query.addEventListener('change', onChange)

        return () => query.removeEventListener('change', onChange)
    }, [])

    const resolvedTheme =
        theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

    useEffect(() => {
        document.documentElement.classList.toggle(
            'dark',
            resolvedTheme === 'dark',
        )
    }, [resolvedTheme])

    function setTheme(next: Theme) {
        try {
            localStorage.setItem(storageKey, next)
        } catch {
            // Storage can be unavailable; the choice then lasts for this page only.
        }

        setThemeState(next)
    }

    return (
        <ThemeContext value={{ theme, resolvedTheme, setTheme }}>
            {children}
        </ThemeContext>
    )
}
