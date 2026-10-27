import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetTextView, useTextView } from '@/hooks/use-text-view'

function Probe({ name }: { name: string }) {
    const [view, setView] = useTextView()

    return (
        <button
            type="button"
            onClick={() => setView(view === 'raw' ? 'rendered' : 'raw')}
        >
            {name} {view}
        </button>
    )
}

afterEach(() => {
    localStorage.clear()
    resetTextView()
    vi.restoreAllMocks()
})

describe('useTextView', () => {
    it('starts rendered and shares one choice between texts', () => {
        render(
            <>
                <Probe name="a" />
                <Probe name="b" />
            </>,
        )

        expect(screen.getByText('a rendered')).toBeVisible()

        act(() => screen.getByText('a rendered').click())

        expect(screen.getByText('a raw')).toBeVisible()
        expect(screen.getByText('b raw')).toBeVisible()
        expect(localStorage.getItem('trail-text-view')).toBe('raw')
    })

    it('reads the stored choice', () => {
        localStorage.setItem('trail-text-view', 'raw')
        render(<Probe name="a" />)

        expect(screen.getByText('a raw')).toBeVisible()
    })

    it('keeps the choice for the page when storage cannot be written', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked')
        })
        render(<Probe name="a" />)

        act(() => screen.getByText('a rendered').click())

        expect(screen.getByText('a raw')).toBeVisible()
    })

    it('follows a choice made in another tab', () => {
        render(<Probe name="a" />)

        act(() => {
            localStorage.setItem('trail-text-view', 'raw')
            window.dispatchEvent(
                new StorageEvent('storage', { key: 'trail-text-view' }),
            )
        })

        expect(screen.getByText('a raw')).toBeVisible()
    })
})
