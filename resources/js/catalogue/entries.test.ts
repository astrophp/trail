import { describe, expect, it } from 'vitest'
import { locateEntries } from '@/catalogue/entries'

const entry = (title: string) => ({ catalogue: { title, specimens: [] } })

describe('locateEntries', () => {
    it('derives layer and a unique id from the path, and orders by layer then title', () => {
        const located = locateEntries({
            '../components/ui/button.catalogue.tsx': entry('Button'),
            '../components/patterns/button.catalogue.tsx': entry('Button'),
            '../components/telemetry/cost.catalogue.tsx': entry('Cost'),
        })

        expect(located.map((e) => [e.layer, e.id])).toEqual([
            ['telemetry', 'telemetry-cost'],
            ['patterns', 'patterns-button'],
            ['ui', 'ui-button'],
        ])
    })

    it('rejects an entry outside the component layers', () => {
        expect(() =>
            locateEntries({ '../lib/x.catalogue.tsx': entry('X') }),
        ).toThrow('../lib/x.catalogue.tsx must live under components')
    })
})
