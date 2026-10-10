import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Profiler, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SplitView } from '@/components/patterns/split-view'

const key = 'test.split'

const baseProps = {
    primary: <p>List</p>,
    secondary: <p>Detail</p>,
    storageKey: key,
    primaryLabel: 'Spans',
    secondaryLabel: 'Span details',
    detailOpen: false,
    backLabel: 'Back to spans',
}

function renderSplit(
    props: Partial<React.ComponentProps<typeof SplitView>> = {},
) {
    const onBack = vi.fn()
    const onRender = vi.fn()
    let latest = { ...baseProps, onBack, ...props }
    const ui = () => (
        <Profiler id="split" onRender={onRender}>
            <SplitView {...latest} />
        </Profiler>
    )
    const view = render(ui())

    // Changes the props, or just renders again (after the window was resized, for instance).
    const update = (next: Partial<React.ComponentProps<typeof SplitView>>) => {
        latest = { ...latest, ...next }
        view.rerender(ui())
    }

    return { ...view, onBack, onRender, update }
}

function Counter({ label }: { label: string }) {
    const [count, setCount] = useState(0)

    return (
        <button type="button" onClick={() => setCount(count + 1)}>
            {label} {count}
        </button>
    )
}

const divider = () => screen.getByRole('separator')
const pane = (name: string) => screen.getByRole('region', { name })
const splitBox = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('[data-slot="split-view"]')!
const sizeVar = (container: HTMLElement) =>
    splitBox(container).style.getPropertyValue('--split-size')

/** A pointer press the way a mouse or a finger makes one. */
const press = (extra = {}) => ({
    pointerId: 1,
    isPrimary: true,
    button: 0,
    buttons: 1,
    ...extra,
})

function layOut(container: HTMLElement, left = 100, width = 1000) {
    splitBox(container).getBoundingClientRect = () =>
        ({ left, width }) as DOMRect
}

beforeEach(() => {
    window.localStorage.clear()
    window.innerWidth = 1280
})

afterEach(() => {
    window.innerWidth = 1024
    vi.restoreAllMocks()
})

describe('SplitView, wide', () => {
    it('shows both panes, named, with the divider between them', () => {
        renderSplit()

        expect(pane('Spans')).toHaveTextContent('List')
        expect(pane('Span details')).toHaveTextContent('Detail')
        expect(divider()).toBeVisible()
        expect(
            screen.queryByRole('button', { name: 'Back to spans' }),
        ).not.toBeInTheDocument()
    })

    it('describes the divider', () => {
        renderSplit({ defaultSize: 40 })

        expect(divider()).toHaveAttribute('aria-orientation', 'vertical')
        expect(divider()).toHaveAttribute('aria-valuenow', '40')
        expect(divider()).toHaveAttribute('aria-valuemin', '25')
        expect(divider()).toHaveAttribute('aria-valuemax', '75')
        expect(divider()).toHaveAccessibleName('Resize panes')
        expect(divider()).toHaveAttribute('tabindex', '0')
    })

    it('starts at the default size of 50 percent', () => {
        const { container } = renderSplit()

        expect(divider()).toHaveAttribute('aria-valuenow', '50')
        expect(sizeVar(container)).toBe('50%')
        expect(pane('Spans').style.width).toBe('var(--split-size)')
    })

    it('moves by a step with the arrow keys', async () => {
        const user = userEvent.setup()
        const { container } = renderSplit()

        divider().focus()

        await user.keyboard('{ArrowRight}')
        expect(divider()).toHaveAttribute('aria-valuenow', '55')

        await user.keyboard('{ArrowLeft}{ArrowLeft}')
        expect(divider()).toHaveAttribute('aria-valuenow', '45')
        expect(sizeVar(container)).toBe('45%')
    })

    it('goes to the limits with Home and End', async () => {
        const user = userEvent.setup()

        renderSplit({ minSize: 20, maxSize: 80 })
        divider().focus()

        await user.keyboard('{Home}')
        expect(divider()).toHaveAttribute('aria-valuenow', '20')

        await user.keyboard('{End}')
        expect(divider()).toHaveAttribute('aria-valuenow', '80')
    })

    it('never goes past the limits', async () => {
        const user = userEvent.setup()

        renderSplit({ defaultSize: 30 })
        divider().focus()

        await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}')
        expect(divider()).toHaveAttribute('aria-valuenow', '25')

        await user.keyboard('{End}{ArrowRight}')
        expect(divider()).toHaveAttribute('aria-valuenow', '75')
    })

    it('ignores other keys', async () => {
        const user = userEvent.setup()

        renderSplit()
        divider().focus()
        await user.keyboard('a{ArrowUp}')

        expect(divider()).toHaveAttribute('aria-valuenow', '50')
    })

    it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey'])(
        'leaves an arrow key alone while %s is held',
        (modifier) => {
            renderSplit()
            divider().focus()

            const notPrevented = fireEvent.keyDown(divider(), {
                key: 'ArrowLeft',
                [modifier]: true,
            })

            expect(notPrevented).toBe(true)
            expect(divider()).toHaveAttribute('aria-valuenow', '50')
            expect(window.localStorage.getItem(key)).toBeNull()

            // The same key without the modifier does move it, so the check above is not vacuous.
            fireEvent.keyDown(divider(), { key: 'ArrowLeft' })

            expect(divider()).toHaveAttribute('aria-valuenow', '45')
        },
    )

    describe('dragging', () => {
        it('follows the pointer without rendering the panes, and commits on release', () => {
            const { container, onRender } = renderSplit()

            layOut(container)
            onRender.mockClear()

            fireEvent.pointerDown(divider(), press({ clientX: 600 }))
            fireEvent.pointerMove(divider(), press({ clientX: 400 }))
            expect(divider()).toHaveAttribute('aria-valuenow', '30')
            expect(sizeVar(container)).toBe('30%')

            fireEvent.pointerMove(divider(), press({ clientX: 100 }))
            expect(divider()).toHaveAttribute('aria-valuenow', '25')

            fireEvent.pointerMove(divider(), press({ clientX: 1100 }))
            expect(divider()).toHaveAttribute('aria-valuenow', '75')
            expect(onRender).not.toHaveBeenCalled()
            expect(window.localStorage.getItem(key)).toBeNull()

            fireEvent.pointerUp(divider(), press({ clientX: 1100, buttons: 0 }))

            expect(onRender).toHaveBeenCalledTimes(1)
            expect(divider()).toHaveAttribute('aria-valuenow', '75')
            expect(sizeVar(container)).toBe('75%')
            expect(window.localStorage.getItem(key)).toBe('75')
        })

        it('prevents the default of the press and turns text selection off until the end', () => {
            const { container } = renderSplit()

            layOut(container)

            const notPrevented = fireEvent.pointerDown(
                divider(),
                press({ clientX: 600 }),
            )

            expect(notPrevented).toBe(false)
            expect(splitBox(container)).toHaveAttribute('data-dragging', 'true')
            expect(splitBox(container).className).toContain(
                'data-[dragging=true]:select-none',
            )

            fireEvent.pointerUp(divider(), press({ clientX: 600, buttons: 0 }))

            expect(splitBox(container)).not.toHaveAttribute('data-dragging')
        })

        it('saves the position when the pointer is cancelled', () => {
            const { container } = renderSplit()

            layOut(container)
            fireEvent.pointerDown(divider(), press({ clientX: 600 }))
            fireEvent.pointerMove(divider(), press({ clientX: 400 }))
            fireEvent.pointerCancel(divider(), press({ buttons: 0 }))

            expect(window.localStorage.getItem(key)).toBe('30')
            expect(divider()).toHaveAttribute('aria-valuenow', '30')
            expect(splitBox(container)).not.toHaveAttribute('data-dragging')

            // It is over: further movement changes nothing.
            fireEvent.pointerMove(divider(), press({ clientX: 800 }))

            expect(divider()).toHaveAttribute('aria-valuenow', '30')
        })

        it('saves the position when pointer capture is lost', () => {
            const { container } = renderSplit()

            layOut(container)
            fireEvent.pointerDown(divider(), press({ clientX: 600 }))
            fireEvent.pointerMove(divider(), press({ clientX: 700 }))
            fireEvent.lostPointerCapture(divider(), press({ buttons: 0 }))

            expect(window.localStorage.getItem(key)).toBe('60')
            expect(divider()).toHaveAttribute('aria-valuenow', '60')
        })

        it('ignores a press of the right button', () => {
            const { container } = renderSplit()

            layOut(container)

            const notPrevented = fireEvent.pointerDown(
                divider(),
                press({ clientX: 600, button: 2, buttons: 2 }),
            )
            fireEvent.pointerMove(divider(), press({ clientX: 400 }))

            expect(notPrevented).toBe(true)
            expect(divider()).toHaveAttribute('aria-valuenow', '50')
            expect(splitBox(container)).not.toHaveAttribute('data-dragging')
        })

        it('ignores a pointer that is not the primary one', () => {
            const { container } = renderSplit()

            layOut(container)
            fireEvent.pointerDown(
                divider(),
                press({ clientX: 600, isPrimary: false }),
            )
            fireEvent.pointerMove(divider(), press({ clientX: 400 }))

            expect(divider()).toHaveAttribute('aria-valuenow', '50')
        })

        it('ignores movement when no button is down', () => {
            const { container } = renderSplit()

            layOut(container)
            fireEvent.pointerDown(divider(), press({ clientX: 600 }))
            fireEvent.pointerMove(divider(), press({ clientX: 400 }))
            expect(divider()).toHaveAttribute('aria-valuenow', '30')

            fireEvent.pointerMove(
                divider(),
                press({ clientX: 800, buttons: 0 }),
            )

            expect(divider()).toHaveAttribute('aria-valuenow', '30')
        })

        it('never produces NaN in a container with no width', () => {
            const { container } = renderSplit()

            layOut(container, 0, 0)
            fireEvent.pointerDown(divider(), press({ clientX: 600 }))
            fireEvent.pointerMove(divider(), press({ clientX: 400 }))
            expect(divider()).toHaveAttribute('aria-valuenow', '50')

            fireEvent.pointerUp(divider(), press({ clientX: 400, buttons: 0 }))

            expect(divider()).toHaveAttribute('aria-valuenow', '50')
            expect(sizeVar(container)).toBe('50%')
            expect(window.localStorage.getItem(key)).toBe('50')
        })

        it('does not move on pointer movement without a press', () => {
            const { container } = renderSplit()

            layOut(container, 0)
            fireEvent.pointerMove(divider(), press({ clientX: 300 }))

            expect(divider()).toHaveAttribute('aria-valuenow', '50')
        })
    })

    it('saves the position and restores it', async () => {
        const user = userEvent.setup()
        const first = renderSplit()

        divider().focus()
        await user.keyboard('{ArrowRight}')

        expect(window.localStorage.getItem(key)).toBe('55')

        first.unmount()
        renderSplit()

        expect(divider()).toHaveAttribute('aria-valuenow', '55')
    })

    it('clamps a stored position and ignores one that is not a number', () => {
        window.localStorage.setItem(key, '99')
        const first = renderSplit()

        expect(divider()).toHaveAttribute('aria-valuenow', '75')

        first.unmount()
        window.localStorage.setItem(key, 'wide')
        renderSplit({ defaultSize: 40 })

        expect(divider()).toHaveAttribute('aria-valuenow', '40')
    })

    it.each(['', '   '])(
        'uses the default size for a stored %j, not zero',
        (stored) => {
            window.localStorage.setItem(key, stored)
            renderSplit({ defaultSize: 40 })

            expect(divider()).toHaveAttribute('aria-valuenow', '40')
        },
    )

    it('reads storage once, however often it renders', async () => {
        const user = userEvent.setup()
        const getItem = vi.spyOn(Storage.prototype, 'getItem')
        const { update } = renderSplit()

        divider().focus()
        await user.keyboard('{ArrowRight}')
        update({ detailOpen: true })
        update({ className: 'extra' })

        expect(divider()).toHaveAttribute('aria-valuenow', '55')
        expect(getItem).toHaveBeenCalledTimes(1)
    })

    it('swaps limits that are the wrong way round', async () => {
        const user = userEvent.setup()

        renderSplit({ minSize: 80, maxSize: 20 })

        expect(divider()).toHaveAttribute('aria-valuemin', '20')
        expect(divider()).toHaveAttribute('aria-valuemax', '80')

        divider().focus()
        await user.keyboard('{Home}')
        expect(divider()).toHaveAttribute('aria-valuenow', '20')

        await user.keyboard('{End}')
        expect(divider()).toHaveAttribute('aria-valuenow', '80')
    })

    it('clamps a default size outside the limits', () => {
        renderSplit({ defaultSize: 5 })
        expect(divider()).toHaveAttribute('aria-valuenow', '25')
    })

    it('keeps working when storage throws', async () => {
        const user = userEvent.setup()
        const boom = () => {
            throw new Error('blocked')
        }

        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)

        renderSplit({ defaultSize: 60 })
        expect(divider()).toHaveAttribute('aria-valuenow', '60')

        divider().focus()
        await user.keyboard('{ArrowRight}')

        expect(divider()).toHaveAttribute('aria-valuenow', '65')
    })

    it('draws the divider as a full-height line with a wider hit area', () => {
        renderSplit()

        expect(divider()).toHaveClass('self-stretch', 'w-px', 'bg-border')
        expect(divider().className).toContain('after:w-3')
        expect(divider().className).toContain('hover:bg-border-strong')
        expect(divider().className).toContain('focus-visible:bg-ring')
        expect(divider().className).toContain('data-[dragging=true]:bg-primary')
    })

    it('takes a class name', () => {
        const { container } = renderSplit({ className: 'extra' })

        expect(container.querySelector('.extra')).toBe(splitBox(container))
    })

    it('does not move focus when the detail opens', () => {
        const { update } = renderSplit()

        update({ detailOpen: true })

        expect(document.body).toHaveFocus()
    })
})

describe('SplitView, single pane', () => {
    beforeEach(() => {
        window.innerWidth = 500
    })

    it('shows only the primary pane until the detail is open', () => {
        renderSplit()

        expect(pane('Spans')).toHaveTextContent('List')
        expect(pane('Spans')).toBeVisible()
        // The detail is in the page but hidden, so it keeps its state.
        expect(screen.getByText('Detail')).not.toBeVisible()
        expect(
            screen.queryByRole('region', { name: 'Span details' }),
        ).not.toBeInTheDocument()
        expect(screen.queryByRole('separator')).not.toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: 'Back to spans' }),
        ).not.toBeInTheDocument()
    })

    it('shows only the secondary pane, with a back action, once the detail is open', async () => {
        const user = userEvent.setup()
        const { onBack } = renderSplit({ detailOpen: true })

        expect(pane('Span details')).toHaveTextContent('Detail')
        expect(screen.getByText('List')).not.toBeVisible()
        expect(
            screen.queryByRole('region', { name: 'Spans' }),
        ).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Back to spans' }))

        expect(onBack).toHaveBeenCalledOnce()
    })

    it('puts the back action above the detail', () => {
        renderSplit({ detailOpen: true })

        const back = screen.getByRole('button', { name: 'Back to spans' })
        const detail = screen.getByText('Detail')

        expect(
            back.compareDocumentPosition(detail) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy()
    })

    describe('state', () => {
        const props = {
            primary: <Counter label="List" />,
            secondary: <Counter label="Detail" />,
        }
        const counter = (name: RegExp) =>
            screen.getByRole('button', { name, hidden: true })

        it('keeps what is inside the panes when the detail opens and closes', () => {
            const { update } = renderSplit(props)
            const list = pane('Spans')

            fireEvent.click(counter(/^List/))
            expect(counter(/^List/)).toHaveTextContent('List 1')

            update({ detailOpen: true })
            fireEvent.click(counter(/^Detail/))
            fireEvent.click(counter(/^Detail/))
            expect(counter(/^List/)).toHaveTextContent('List 1')
            expect(counter(/^Detail/)).toHaveTextContent('Detail 2')

            update({ detailOpen: false })
            expect(pane('Spans')).toBe(list)
            expect(counter(/^List/)).toHaveTextContent('List 1')
            expect(counter(/^Detail/)).toHaveTextContent('Detail 2')
        })

        it('keeps what is inside the panes across the breakpoint', () => {
            window.innerWidth = 1280

            const { update } = renderSplit(props)
            const list = pane('Spans')
            const detail = pane('Span details')

            fireEvent.click(counter(/^List/))
            fireEvent.click(counter(/^Detail/))

            window.innerWidth = 500
            update({})
            expect(screen.queryByRole('separator')).not.toBeInTheDocument()
            expect(pane('Spans')).toBe(list)
            expect(counter(/^List/)).toHaveTextContent('List 1')
            expect(counter(/^Detail/)).toHaveTextContent('Detail 1')

            window.innerWidth = 1280
            update({})
            expect(divider()).toBeVisible()
            expect(pane('Spans')).toBe(list)
            expect(pane('Span details')).toBe(detail)
            expect(counter(/^List/)).toHaveTextContent('List 1')
            expect(counter(/^Detail/)).toHaveTextContent('Detail 1')
        })
    })

    describe('focus', () => {
        it('moves to the detail when it opens', () => {
            const { update } = renderSplit()

            update({ detailOpen: true })

            expect(pane('Span details')).toHaveFocus()
        })

        it('scrolls the top of the detail into view when it opens, and not for the list', () => {
            const scroll = vi.fn()
            Element.prototype.scrollIntoView = scroll
            const { update } = renderSplit()

            update({ detailOpen: true })

            expect(scroll).toHaveBeenCalledTimes(1)
            expect(scroll).toHaveBeenCalledWith({ block: 'start' })
            expect(scroll.mock.contexts[0]).toBe(pane('Span details'))

            update({ detailOpen: false })

            expect(scroll).toHaveBeenCalledTimes(1)

            Element.prototype.scrollIntoView = () => {}
        })

        it('moves back to the list when the detail closes', () => {
            const { update } = renderSplit({ detailOpen: true })

            update({ detailOpen: false })

            expect(pane('Spans')).toHaveFocus()
        })

        it('is not taken on first mount, open or not', () => {
            const first = renderSplit({ detailOpen: true })

            expect(pane('Span details')).toBeVisible()
            expect(document.body).toHaveFocus()

            first.unmount()
            renderSplit()

            expect(pane('Spans')).toBeVisible()
            expect(document.body).toHaveFocus()
        })

        it('is not taken when only the breakpoint changes', () => {
            window.innerWidth = 1280

            const { update } = renderSplit({ detailOpen: true })

            window.innerWidth = 500
            update({})

            expect(pane('Span details')).toBeVisible()
            expect(document.body).toHaveFocus()
        })
    })
})
