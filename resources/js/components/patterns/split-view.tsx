import { ArrowLeftIcon } from 'lucide-react'
import {
    useEffect,
    useId,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent,
    type PointerEvent,
    type ReactNode,
} from 'react'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/use-mobile'
import { readStored, writeStored } from '@/lib/storage'
import { cn } from '@/lib/utils'

/** How far an arrow key moves the divider, in percent. */
const step = 5

type SplitViewProps = {
    primary: ReactNode
    secondary: ReactNode
    /** Where the divider position is remembered in the browser. */
    storageKey: string
    /** The primary pane's share of the width, in percent. */
    defaultSize?: number
    minSize?: number
    maxSize?: number
    /** The accessible names of the two regions. */
    primaryLabel: string
    secondaryLabel: string
    /** Below the `md` breakpoint only one pane shows: the secondary one while this is true. */
    detailOpen: boolean
    onBack: () => void
    /** The words on the back action shown above the secondary pane in single-pane mode. */
    backLabel: string
    className?: string
}

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value))

/** A stored position, or `null` when there is none or it is not a number (an empty string is not zero). */
function storedSize(key: string): number | null {
    const stored = readStored(key)

    if (stored === null || stored.trim() === '') {
        return null
    }

    const parsed = Number(stored)

    return Number.isFinite(parsed) ? parsed : null
}

/**
 * Two panes side by side with a draggable divider; below the `md` breakpoint a single pane at a
 * time. The caller decides when the detail is open. The divider position is kept in the browser.
 *
 * Both panes are always in the page in the same structure (the one that is not shown is `hidden`),
 * so opening the detail or crossing the breakpoint never loses what is inside them. In single-pane
 * mode focus moves to the pane that appears. Give the component a height for the panes to scroll
 * in; the divider spans it. It assumes a left-to-right layout: the primary pane is on the left.
 */
export function SplitView({
    primary,
    secondary,
    storageKey,
    defaultSize = 50,
    minSize = 25,
    maxSize = 75,
    primaryLabel,
    secondaryLabel,
    detailOpen,
    onBack,
    backLabel,
    className,
}: SplitViewProps) {
    const compact = useIsMobile()
    const primaryId = useId()
    const container = useRef<HTMLDivElement>(null)
    const divider = useRef<HTMLDivElement>(null)
    const primaryPane = useRef<HTMLElement>(null)
    const secondaryPane = useRef<HTMLElement>(null)
    const previousOpen = useRef(detailOpen)
    const dragging = useRef<number | null>(null)
    const lo = Math.min(minSize, maxSize)
    const hi = Math.max(minSize, maxSize)
    const [size, setSize] = useState(
        () => storedSize(storageKey) ?? defaultSize,
    )
    const current = clamp(size, lo, hi)
    // The size the divider is at right now, which during a drag is ahead of the state.
    const live = useRef(current)

    useEffect(() => {
        const wasOpen = previousOpen.current

        previousOpen.current = detailOpen

        if (!compact || wasOpen === detailOpen) {
            return
        }

        const pane = detailOpen ? secondaryPane : primaryPane

        pane.current?.focus({ preventScroll: true })
    }, [detailOpen, compact])

    function commit(next: number) {
        const value = clamp(next, lo, hi)

        live.current = value
        setSize(value)
        writeStored(storageKey, String(value))
    }

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
            return
        }

        const targets: Record<string, number> = {
            ArrowLeft: current - step,
            ArrowRight: current + step,
            Home: lo,
            End: hi,
        }

        if (event.key in targets) {
            event.preventDefault()
            commit(targets[event.key])
        }
    }

    function fromPointer(event: PointerEvent<HTMLDivElement>) {
        const box = container.current?.getBoundingClientRect()

        return box && box.width > 0
            ? clamp(((event.clientX - box.left) / box.width) * 100, lo, hi)
            : null
    }

    // While a drag is going on the size is written to the DOM only; React hears of it on release.
    function show(value: number) {
        live.current = value
        container.current?.style.setProperty('--split-size', `${value}%`)
        divider.current?.setAttribute(
            'aria-valuenow',
            String(Math.round(value)),
        )
    }

    function endDrag(event: PointerEvent<HTMLDivElement>, position?: number) {
        if (dragging.current !== event.pointerId) {
            return
        }

        dragging.current = null
        delete container.current?.dataset.dragging
        delete divider.current?.dataset.dragging

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }

        commit(position ?? live.current)
    }

    return (
        <div
            ref={container}
            data-slot="split-view"
            data-mode={compact ? 'single' : 'split'}
            style={{ '--split-size': `${current}%` } as CSSProperties}
            className={cn(
                'min-w-0 data-[dragging=true]:select-none',
                !compact && 'flex min-h-0',
                className,
            )}
        >
            <section
                ref={primaryPane}
                id={primaryId}
                aria-label={primaryLabel}
                hidden={compact && detailOpen}
                tabIndex={-1}
                style={compact ? undefined : { width: 'var(--split-size)' }}
                className={cn(
                    'min-w-0 outline-none',
                    !compact && 'shrink-0 overflow-auto',
                )}
            >
                {primary}
            </section>
            {/* A separator that can be focused is a widget (a slider-like splitter, per WAI-ARIA), which the lint rules do not know. */}
            {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
            {!compact && (
                <div
                    ref={divider}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize panes"
                    aria-controls={primaryId}
                    aria-valuenow={Math.round(current)}
                    aria-valuemin={lo}
                    aria-valuemax={hi}
                    tabIndex={0}
                    data-slot="split-view-divider"
                    className="relative w-px shrink-0 cursor-col-resize touch-none self-stretch bg-border outline-none after:absolute after:inset-y-0 after:-left-1 after:w-3 hover:bg-border-strong focus-visible:bg-ring focus-visible:ring-2 focus-visible:ring-ring/50 data-[dragging=true]:bg-primary"
                    onKeyDown={onKeyDown}
                    onPointerDown={(event) => {
                        if (event.button !== 0 || !event.isPrimary) {
                            return
                        }

                        event.preventDefault()
                        dragging.current = event.pointerId
                        live.current = current
                        event.currentTarget.dataset.dragging = 'true'

                        if (container.current) {
                            container.current.dataset.dragging = 'true'
                        }

                        event.currentTarget.setPointerCapture(event.pointerId)
                    }}
                    onPointerMove={(event) => {
                        if (
                            dragging.current !== event.pointerId ||
                            event.buttons === 0
                        ) {
                            return
                        }

                        const next = fromPointer(event)

                        if (next !== null) {
                            show(next)
                        }
                    }}
                    onPointerUp={(event) =>
                        endDrag(event, fromPointer(event) ?? undefined)
                    }
                    onPointerCancel={(event) => endDrag(event)}
                    onLostPointerCapture={(event) => endDrag(event)}
                />
            )}
            {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
            <section
                ref={secondaryPane}
                aria-label={secondaryLabel}
                hidden={compact && !detailOpen}
                tabIndex={-1}
                className={cn(
                    'min-w-0 outline-none',
                    compact ? 'flex flex-col gap-2' : 'flex-1 overflow-auto',
                )}
            >
                {compact && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        onClick={onBack}
                    >
                        <ArrowLeftIcon aria-hidden="true" />
                        {backLabel}
                    </Button>
                )}
                {secondary}
            </section>
        </div>
    )
}
