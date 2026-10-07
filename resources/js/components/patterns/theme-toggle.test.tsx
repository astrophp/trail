import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@/app/providers/theme-provider'
import { ThemeToggle } from '@/components/patterns/theme-toggle'

let systemDark = false
let notify: (event: { matches: boolean }) => void = () => {}

beforeEach(() => {
    systemDark = false
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    // On top of the default stub from test/setup.ts: a controllable system setting.
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: systemDark,
        media: query,
        addEventListener: (_: string, listener: typeof notify) => {
            notify = listener
        },
        removeEventListener: () => {},
    }))
})

const open = async () => {
    render(
        <ThemeProvider>
            <ThemeToggle className="extra" />
        </ThemeProvider>,
    )
    const button = screen.getByRole('button', { name: /^Theme/ })
    await userEvent.click(button)

    return button
}

describe('ThemeToggle', () => {
    it('offers light, dark and system, with the current choice checked', async () => {
        await open()

        expect(
            screen.getByRole('menuitemradio', { name: 'System' }),
        ).toBeChecked()
        expect(screen.getAllByRole('menuitemradio')).toHaveLength(3)
    })

    it('names the trigger after the current choice', () => {
        render(
            <ThemeProvider>
                <ThemeToggle />
            </ThemeProvider>,
        )

        expect(
            screen.getByRole('button', { name: 'Theme: System' }),
        ).toBeInTheDocument()
    })

    it('accepts a className', () => {
        render(
            <ThemeProvider>
                <ThemeToggle className="extra" />
            </ThemeProvider>,
        )

        expect(screen.getByRole('button', { name: /^Theme/ })).toHaveClass(
            'extra',
        )
    })

    it('switches the dark class and remembers the choice', async () => {
        await open()
        await userEvent.click(
            screen.getByRole('menuitemradio', { name: 'Dark' }),
        )

        expect(document.documentElement).toHaveClass('dark')
        expect(localStorage.getItem('trail-theme')).toBe('dark')

        await userEvent.click(screen.getByRole('button', { name: /^Theme/ }))
        await userEvent.click(
            screen.getByRole('menuitemradio', { name: 'Light' }),
        )

        expect(document.documentElement).not.toHaveClass('dark')
        expect(localStorage.getItem('trail-theme')).toBe('light')
    })

    it('starts from the stored choice and follows the system while on system', async () => {
        localStorage.setItem('trail-theme', 'system')
        systemDark = true
        await open()

        expect(document.documentElement).toHaveClass('dark')

        await userEvent.keyboard('{Escape}')
        act(() => notify({ matches: false }))

        expect(document.documentElement).not.toHaveClass('dark')
    })

    it('keeps working when storage throws', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked')
        })
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked')
        })
        await open()
        await userEvent.click(
            screen.getByRole('menuitemradio', { name: 'Dark' }),
        )

        expect(document.documentElement).toHaveClass('dark')
        vi.restoreAllMocks()
    })
})
