/**
 * The part of what Recharts hands a tooltip's `content` that the chart reads: whether it is shown,
 * and which bucket the pointer is on. The chart gives every row its position as the x category, so
 * Recharts' `label` is that position, even when a series has no value there and the payload is
 * empty. `activeIndex` is the fallback.
 */
export type TooltipTarget = { active: boolean; index: number | undefined }

export function tooltipTarget(props: {
    active?: boolean
    label?: unknown
    activeIndex?: unknown
}): TooltipTarget {
    const candidates = [props.label, props.activeIndex]

    for (const candidate of candidates) {
        const index =
            typeof candidate === 'number'
                ? candidate
                : typeof candidate === 'string' && candidate.trim() !== ''
                  ? Number(candidate)
                  : Number.NaN

        if (Number.isInteger(index) && index >= 0) {
            return { active: props.active === true, index }
        }
    }

    return { active: props.active === true, index: undefined }
}
