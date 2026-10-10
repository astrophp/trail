import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useElementWidth } from '@/hooks/use-element-width'

function Probe({ present = true }: { present?: boolean }) {
    const [ref, width] = useElementWidth(320)

    return (
        <div>
            {present ? <div ref={ref} data-testid="measured" /> : null}
            <span data-testid="width">{width}</span>
        </div>
    )
}

/** A ResizeObserver that records what it watches and lets a test report a size. */
function stubObserver() {
    const observed = new Set<Element>()
    const created: { notify: (width: number) => void }[] = []

    vi.stubGlobal(
        'ResizeObserver',
        class {
            private watching = new Set<Element>()

            constructor(private callback: (entries: unknown[]) => void) {
                created.push({
                    notify: (width) =>
                        this.callback([{ contentRect: { width } }]),
                })
            }
            observe(element: Element) {
                this.watching.add(element)
                observed.add(element)
            }
            disconnect() {
                for (const element of this.watching) {
                    observed.delete(element)
                }

                this.watching.clear()
            }
        },
    )

    return { observed, created }
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
        const { observed, created } = stubObserver()
        const { unmount } = render(<Probe />)

        expect(observed.has(screen.getByTestId('measured'))).toBe(true)

        act(() => {
            created.at(-1)!.notify(180)
        })

        expect(screen.getByTestId('width')).toHaveTextContent('180')

        unmount()

        expect(observed.size).toBe(0)
    })

    it('measures an element that was not there when the component first rendered', () => {
        const { observed, created } = stubObserver()
        const { rerender } = render(<Probe present={false} />)

        expect(observed.size).toBe(0)

        rerender(<Probe present />)

        expect(observed.has(screen.getByTestId('measured'))).toBe(true)

        act(() => {
            created.at(-1)!.notify(500)
        })

        expect(screen.getByTestId('width')).toHaveTextContent('500')
    })

    it('stops observing an element that goes away while the component stays', () => {
        const { observed } = stubObserver()
        const { rerender } = render(<Probe present />)

        expect(observed.size).toBe(1)

        rerender(<Probe present={false} />)

        expect(observed.size).toBe(0)
    })

    it('observes the new element when the element is replaced', () => {
        const { observed } = stubObserver()
        const { rerender } = render(<Probe present />)
        const first = screen.getByTestId('measured')

        rerender(<Probe present={false} />)
        rerender(<Probe present />)

        expect(observed.has(first)).toBe(false)
        expect(observed.has(screen.getByTestId('measured'))).toBe(true)
        expect(observed.size).toBe(1)
    })
})
