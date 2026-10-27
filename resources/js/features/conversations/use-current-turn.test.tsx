import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { turnDomId } from '@/features/conversations/transcript-turns'
import { useCurrentTurn } from '@/features/conversations/use-current-turn'

const ids = ['a', 'b', 'c']

function Probe() {
    const current = useCurrentTurn(ids)

    return (
        <>
            {ids.map((id) => (
                <article key={id} id={turnDomId(id)} />
            ))}
            <output>{current ?? 'none'}</output>
        </>
    )
}

/** Puts each turn's box where `tops` says, 500 pixels tall, in a window 800 tall. */
function place(tops: Record<string, number>) {
    for (const id of ids) {
        const top = tops[id]

        vi.spyOn(
            document.getElementById(turnDomId(id))!,
            'getBoundingClientRect',
        ).mockReturnValue({ top, bottom: top + 500 } as DOMRect)
    }
}

afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
})

describe('useCurrentTurn', () => {
    it('follows the turn that crosses the reading band as the page scrolls', () => {
        vi.useFakeTimers()
        vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
        render(<Probe />)

        place({ a: 100, b: 600, c: 1100 })
        act(() => {
            vi.runAllTimers()
        })
        expect(screen.getByRole('status')).toHaveTextContent('a')

        place({ a: -500, b: 0, c: 500 })
        act(() => {
            window.dispatchEvent(new Event('scroll'))
        })
        expect(screen.getByRole('status')).toHaveTextContent('b')
    })

    it('keeps the last turn read while none crosses the band', () => {
        vi.useFakeTimers()
        vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
        render(<Probe />)

        place({ a: 100, b: 600, c: 1100 })
        act(() => {
            vi.runAllTimers()
        })

        place({ a: -2000, b: 500, c: 1000 })
        act(() => {
            window.dispatchEvent(new Event('scroll'))
        })
        expect(screen.getByRole('status')).toHaveTextContent('a')
    })
})
