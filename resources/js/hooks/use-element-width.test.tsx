import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useElementWidth } from '@/hooks/use-element-width'

function Probe() {
    const ref = useRef<HTMLDivElement>(null)
    const width = useElementWidth(ref, 320)

    return (
        <div ref={ref}>
            <span data-testid="width">{width}</span>
        </div>
    )
}

describe('useElementWidth', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('keeps the initial width when the environment cannot measure', () => {
        vi.stubGlobal('ResizeObserver', undefined)
        render(<Probe />)

        expect(screen.getByTestId('width')).toHaveTextContent('320')
    })

    it('follows the element, and stops observing when it goes away', () => {
        let notify: (entries: unknown[]) => void = () => {}
        const disconnect = vi.fn()

        vi.stubGlobal(
            'ResizeObserver',
            class {
                constructor(callback: (entries: unknown[]) => void) {
                    notify = callback
                }
                observe() {}
                disconnect = disconnect
            },
        )

        const { unmount } = render(<Probe />)

        expect(screen.getByTestId('width')).toHaveTextContent('320')

        act(() => {
            notify([{ contentRect: { width: 180 } }])
        })

        expect(screen.getByTestId('width')).toHaveTextContent('180')

        unmount()

        expect(disconnect).toHaveBeenCalledTimes(1)
    })
})
