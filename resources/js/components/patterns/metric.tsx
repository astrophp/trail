import { useId, type ComponentProps, type ReactNode } from 'react'
import { metricCellClassName } from '@/components/patterns/metric-strip-styles'
import { RowLink } from '@/components/patterns/row-link'
import { cn } from '@/lib/utils'

type MetricProps = {
    label: string
    /** The value, drawn as given: the caller passes a component that knows how to format it. */
    children: ReactNode
    /** How the value moved, usually a `Change`. Under the value. Not interactive: the metric's link covers it. */
    change?: ReactNode
    /** A small secondary line beside the change, such as "27 failed". Not interactive: the metric's link covers it. */
    detail?: ReactNode
    /**
     * A link or button of its own, for what to do about the figure: on its own line, above the
     * metric's link so it stays a target of its own.
     */
    action?: ReactNode
    /** Makes the whole metric a link to the evidence behind it. */
    to?: ComponentProps<typeof RowLink>['to']
    className?: string
}

/**
 * One figure of a `MetricStrip`: its label, its value, and optionally how it moved and a detail.
 * With `to` the label is the one link and its target covers the whole metric.
 */
export function Metric({
    label,
    children,
    change,
    detail,
    action,
    to,
    className,
}: MetricProps) {
    const valueId = useId()

    return (
        <div
            data-slot="metric"
            className={cn(
                metricCellClassName,
                'flex flex-wrap content-start items-center gap-x-1.5 gap-y-1',
                className,
            )}
        >
            <dt className="basis-full text-xs text-muted-foreground">
                {to === undefined ? (
                    label
                ) : (
                    <RowLink
                        to={to}
                        aria-describedby={valueId}
                        className="font-normal text-muted-foreground"
                    >
                        {label}
                    </RowLink>
                )}
            </dt>
            <dd
                id={valueId}
                className="mt-1 basis-full text-title-compact text-foreground tabular-nums @2xl:text-title"
            >
                {children}
            </dd>
            {/* A `Change` that has nothing to say renders nothing: the empty `dd` must not take a gap. */}
            {change ? <dd className="mt-1.5 empty:hidden">{change}</dd> : null}
            {detail ? (
                <dd className="mt-1.5 text-caption text-muted-foreground empty:hidden">
                    {detail}
                </dd>
            ) : null}
            {/* Above the metric's stretched link, which would otherwise take every click. */}
            {action ? (
                <dd className="relative z-1 mt-1.5 basis-full text-caption">
                    {action}
                </dd>
            ) : null}
        </div>
    )
}
