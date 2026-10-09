/** The size of the drawing's own coordinate space; the SVG stretches it to whatever box it has. */
const extent = 100
/** Room above and below, so the line is not cut off at the edges of the box. */
const inset = 2

/** Where the bottom of a sparkline is: its lowest value, or zero. */
export type SparklineBaseline = 'range' | 'zero'

const round = (value: number) => Number(value.toFixed(2))

/**
 * The path of a sparkline in a 100 × 100 space, y growing downwards. A `null` (or a value that is
 * not a finite number) breaks the line; it is never drawn as 0. A stretch of one value between
 * two breaks is a zero-length segment, drawn as a dot by a round line cap, so it does not vanish.
 * With fewer than two values to draw the result is empty. All values equal is a flat line at mid
 * height. Values are spread evenly along x by position, nulls included.
 *
 * `baseline` says where the bottom of the drawing is. `range` (the default) is the lowest value, so
 * every line fills the box. `zero` is 0 (or the lowest value when that is below 0): a line that
 * never drops to zero is not stretched to the whole box, and a line of nothing but zeros is not drawn, since it is not a shape.
 */
export function sparklinePath(
    values: (number | null)[],
    baseline: SparklineBaseline = 'range',
): string {
    const present = values.filter(
        (value): value is number =>
            typeof value === 'number' && Number.isFinite(value),
    )

    if (present.length < 2) {
        return ''
    }

    const low =
        baseline === 'zero' ? Math.min(0, ...present) : Math.min(...present)
    const high = Math.max(...present)
    // Halved first, so the span of two huge values of opposite sign does not overflow.
    const range = high / 2 - low / 2

    if (baseline === 'zero' && range === 0) {
        return ''
    }

    const lastIndex = values.length - 1

    const point = (value: number, index: number) => {
        const x = round((index / lastIndex) * extent)
        const y =
            range === 0
                ? extent / 2
                : round(
                      inset +
                          (1 - (value / 2 - low / 2) / range) *
                              (extent - inset * 2),
                  )

        return { x, y }
    }

    let path = ''
    let previous: number | null = null

    values.forEach((value, index) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            previous = null

            return
        }

        const { x, y } = point(value, index)
        const next: number | null = values[index + 1] ?? null
        const alone =
            previous === null &&
            (typeof next !== 'number' || !Number.isFinite(next))

        if (previous === null) {
            path += `${path ? ' ' : ''}M${x} ${y}${alone ? 'h0' : ''}`
        } else {
            path += `L${x} ${y}`
        }

        previous = value
    })

    return path
}
