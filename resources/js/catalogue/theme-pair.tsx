import type { ReactNode } from 'react'

/** Renders its children twice, side by side: once in the light theme and once in the dark one. */
export function ThemePair({ children }: { children: ReactNode }) {
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div
                role="group"
                aria-label="Light theme"
                className="light rounded-lg border bg-background p-4 text-foreground"
            >
                {children}
            </div>
            <div
                role="group"
                aria-label="Dark theme"
                className="dark rounded-lg border bg-background p-4 text-foreground"
            >
                {children}
            </div>
        </div>
    )
}
