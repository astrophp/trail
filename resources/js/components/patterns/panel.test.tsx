import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelFooter } from '@/components/patterns/panel-footer'
import { PanelHeader } from '@/components/patterns/panel-header'

describe('Panel', () => {
    it('holds a header, content and a footer in that order', () => {
        const { container } = render(
            <Panel>
                <PanelHeader title="Trace activity" />
                <PanelContent>the body</PanelContent>
                <PanelFooter>the footer</PanelFooter>
            </Panel>,
        )

        expect(
            Array.from(container.firstElementChild?.children ?? []).map(
                (child) => child.getAttribute('data-slot'),
            ),
        ).toEqual(['panel-header', 'panel-content', 'panel-footer'])
        expect(screen.getByText('the body')).toBeInTheDocument()
        expect(screen.getByText('the footer')).toBeInTheDocument()
    })

    it('takes a class name on each part', () => {
        const { container } = render(
            <Panel className="a">
                <PanelHeader title="T" className="b" />
                <PanelContent className="c">x</PanelContent>
                <PanelFooter className="d">y</PanelFooter>
            </Panel>,
        )

        expect(container.querySelector('[data-slot="panel"]')).toHaveClass('a')
        expect(
            container.querySelector('[data-slot="panel-header"]'),
        ).toHaveClass('b')
        expect(
            container.querySelector('[data-slot="panel-content"]'),
        ).toHaveClass('c')
        expect(
            container.querySelector('[data-slot="panel-footer"]'),
        ).toHaveClass('d')
    })
})

describe('PanelHeader', () => {
    it('titles the panel with a level 2 heading by default', () => {
        render(<PanelHeader title="Trace activity" />)

        expect(
            screen.getByRole('heading', { level: 2, name: 'Trace activity' }),
        ).toBeInTheDocument()
    })

    it.each([3, 4] as const)('takes a heading level of %s', (level) => {
        render(<PanelHeader title="Trace activity" headingLevel={level} />)

        expect(
            screen.getByRole('heading', { level, name: 'Trace activity' }),
        ).toBeInTheDocument()
        expect(screen.getAllByRole('heading')).toHaveLength(1)
    })

    it('shows a description and an action only when it has them', () => {
        const { container, rerender } = render(
            <PanelHeader title="Trace activity" />,
        )

        expect(
            container.querySelector('[data-slot="card-description"]'),
        ).toBeNull()
        expect(container.querySelector('[data-slot="card-action"]')).toBeNull()

        rerender(
            <PanelHeader
                title="Trace activity"
                description="Recorded runs over time"
                action={<button type="button">View all</button>}
            />,
        )

        expect(screen.getByText('Recorded runs over time')).toBeInTheDocument()
        expect(
            container.querySelector('[data-slot="card-action"]'),
        ).toContainElement(screen.getByRole('button', { name: 'View all' }))
    })

    it('puts the title, the description and the action in reading order', () => {
        const { container } = render(
            <PanelHeader
                title="Title"
                description="Description"
                action={<button type="button">Action</button>}
            />,
        )

        expect(
            Array.from(container.firstElementChild?.children ?? []).map(
                (child) => child.textContent,
            ),
        ).toEqual(['Title', 'Description', 'Action'])
    })
})
