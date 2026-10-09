import { Sparkline } from '@/components/patterns/sparkline'
import type { CatalogueEntry } from '@/catalogue/types'

function Row({
    name,
    values,
    className,
    baseline,
}: {
    name: string
    values: (number | null)[]
    className?: string
    baseline?: 'range' | 'zero'
}) {
    return (
        <div className="flex items-center gap-3 text-ui">
            <Sparkline
                values={values}
                summary={`${name}: ${values.length} values`}
                className={className}
                baseline={baseline}
            />
            <span className="text-muted-foreground">{name}</span>
        </div>
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Sparkline',
    specimens: [
        {
            name: 'Shapes',
            Component: () => (
                <div className="flex flex-col gap-2">
                    <Row name="Rising" values={[1, 2, 2, 4, 6, 9]} />
                    <Row
                        name="Falling, with a gap"
                        values={[9, 7, null, 4, 3, 1]}
                    />
                    <Row name="Flat" values={[5, 5, 5, 5]} />
                    <Row
                        name="Gaps at the ends"
                        values={[null, 2, 6, 3, null]}
                    />
                    <Row
                        name="A lone point between gaps"
                        values={[1, null, 4, null, 2, 3]}
                    />
                    <Row
                        name="Another colour"
                        values={[3, 1, 4, 1, 5]}
                        className="text-chart-4"
                    />
                </div>
            ),
        },
        {
            name: 'Baseline: from the lowest value, and from zero',
            Component: () => (
                <div className="flex flex-col gap-2">
                    <Row
                        name="Lowest value: 3, 4, 3, 4"
                        values={[3, 4, 3, 4]}
                    />
                    <Row
                        name="Zero: 3, 4, 3, 4"
                        values={[3, 4, 3, 4]}
                        baseline="zero"
                    />
                    <Row
                        name="Zero: 300, 400, 300, 400"
                        values={[300, 400, 300, 400]}
                        baseline="zero"
                    />
                    <Row
                        name="Zero: all zeros draws nothing"
                        values={[0, 0, 0, 0]}
                        baseline="zero"
                    />
                </div>
            ),
        },
        {
            name: 'Nothing to draw',
            Component: () => (
                <div className="flex flex-col gap-2">
                    <Row name="One value" values={[7]} />
                    <Row name="All missing" values={[null, null, null]} />
                    <Row name="No values" values={[]} />
                </div>
            ),
        },
    ],
}
