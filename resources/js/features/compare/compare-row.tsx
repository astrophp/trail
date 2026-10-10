import type { ReactNode } from 'react'
import { DiffersMarker } from '@/features/compare/differs-marker'

type CompareRowProps = {
    label: string
    /** Run A's side and run B's. */
    a: ReactNode
    b: ReactNode
    /** The two sides are present and not equal. */
    differs?: boolean
}

/** One attribute of two runs: side by side from the `md` breakpoint, A over B below it. */
export function CompareRow({ label, a, b, differs = false }: CompareRowProps) {
    const sides: [string, ReactNode][] = [
        ['A', a],
        ['B', b],
    ]

    return (
        <div
            data-slot="compare-row"
            className="grid gap-2 px-4 py-3 md:grid-cols-5 md:gap-6"
        >
            <dt className="flex flex-wrap items-center gap-x-3 text-caption text-muted-foreground md:flex-col md:items-start md:gap-1">
                {label}
                {differs ? <DiffersMarker /> : null}
            </dt>
            {sides.map(([name, side]) => (
                <dd key={name} className="min-w-0 text-ui md:col-span-2">
                    <span className="block text-caption text-muted-foreground md:sr-only">
                        Run {name}
                    </span>
                    {side}
                </dd>
            ))}
        </div>
    )
}
