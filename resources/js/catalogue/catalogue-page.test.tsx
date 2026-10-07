import { render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { CataloguePage } from '@/catalogue/catalogue-page'

function Counter() {
    const [n] = useState(3)

    return <p>count {n}</p>
}

const entries = [
    {
        id: 'ui-sample',
        layer: 'ui' as const,
        title: 'Sample',
        specimens: [{ name: 'Plain', Component: Counter }],
    },
]

describe('CataloguePage', () => {
    it('links to each entry and renders every specimen in both themes', () => {
        const { container } = render(<CataloguePage entries={entries} />)

        expect(
            within(screen.getByRole('navigation')).getByRole('link', {
                name: 'ui / Sample',
            }),
        ).toHaveAttribute('href', '#ui-sample')
        expect(screen.getByRole('main')).toBeInTheDocument()
        expect(screen.getAllByText('count 3')).toHaveLength(2)
        expect(
            within(screen.getByRole('group', { name: 'Dark theme' })).getByText(
                'count 3',
            ),
        ).toBeInTheDocument()
        expect(screen.getByRole('group', { name: 'Light theme' })).toBeVisible()
        expect(container.querySelectorAll('.dark')).toHaveLength(1)
    })
})
