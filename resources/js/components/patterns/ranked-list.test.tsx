import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { RankedList } from '@/components/patterns/ranked-list'
import { RankedListItem } from '@/components/patterns/ranked-list-item'

function bar(item: HTMLElement) {
    return item.querySelector('[data-slot="ranked-list-bar"]')
}

describe('RankedList', () => {
    it('is an ordered list that keeps the order it is given', () => {
        const { container } = render(
            <RankedList>
                <RankedListItem label="gpt-5" value="$8" share={0.5} />
                <RankedListItem label="claude" value="$3" share={0.2} />
                <RankedListItem label="mini" value="$1" share={0.1} />
            </RankedList>,
        )

        expect(container.querySelector('ol')).not.toBeNull()
        expect(
            screen.getAllByRole('listitem').map((item) => item.textContent),
        ).toEqual(['gpt-5$8', 'claude$3', 'mini$1'])
    })

    it('draws a bar as wide as the share', () => {
        render(
            <RankedList>
                <RankedListItem label="half" value="1" share={0.5} />
                <RankedListItem label="none" value="0" share={0} />
                <RankedListItem label="all" value="2" share={1} />
            </RankedList>,
        )

        const [half, none, all] = screen.getAllByRole('listitem')

        expect(bar(half)?.firstElementChild).toHaveStyle({ width: '50%' })
        expect(bar(none)?.firstElementChild).toHaveStyle({ width: '0%' })
        expect(bar(all)?.firstElementChild).toHaveStyle({ width: '100%' })
    })

    it('draws no bar at all for a share that is not known', () => {
        render(
            <RankedList>
                <RankedListItem label="known" value="1" share={0.5} />
                <RankedListItem label="unknown" value="Unpriced" share={null} />
            </RankedList>,
        )

        const [known, unknown] = screen.getAllByRole('listitem')

        expect(bar(known)).not.toBeNull()
        expect(bar(unknown)).toBeNull()
        expect(unknown).toHaveTextContent('unknownUnpriced')
    })

    it('keeps a share inside the bar, and draws none for a number that is not one', () => {
        render(
            <RankedList>
                <RankedListItem label="over" value="1" share={1.5} />
                <RankedListItem label="under" value="1" share={-0.5} />
                <RankedListItem label="nan" value="1" share={NaN} />
            </RankedList>,
        )

        const [over, under, nan] = screen.getAllByRole('listitem')

        expect(bar(over)?.firstElementChild).toHaveStyle({ width: '100%' })
        expect(bar(under)?.firstElementChild).toHaveStyle({ width: '0%' })
        expect(bar(nan)).toBeNull()
    })

    it('hides the bar from assistive technology and leaves the value as its text', () => {
        render(
            <RankedList>
                <RankedListItem label="gpt-5" value="$8.20" share={0.66} />
            </RankedList>,
        )

        const item = screen.getByRole('listitem')

        expect(bar(item)).toHaveAttribute('aria-hidden', 'true')
        expect(screen.getByText('$8.20')).toBeInTheDocument()
    })

    it('draws the value as given and a detail when it has one', () => {
        const { container } = render(
            <RankedList>
                <RankedListItem
                    label="gpt-5"
                    value={<span data-testid="value">1234567.891</span>}
                    share={null}
                    detail="812 runs"
                />
                <RankedListItem label="mini" value="1" share={null} />
            </RankedList>,
        )

        expect(screen.getByTestId('value')).toHaveTextContent('1234567.891')
        expect(screen.getByText('812 runs')).toBeInTheDocument()
        expect(screen.getAllByRole('listitem')[1]).toHaveTextContent(/^mini1$/)
        expect(container.querySelectorAll('li')).toHaveLength(2)
    })

    it('makes the label a link when the item has a target, and only then', () => {
        render(
            <MemoryRouter>
                <RankedList>
                    <RankedListItem
                        label="gpt-5"
                        value="1"
                        share={0.5}
                        to="/traces?model=gpt-5"
                    />
                    <RankedListItem label="mini" value="1" share={0.5} />
                </RankedList>
            </MemoryRouter>,
        )

        const links = screen.getAllByRole('link')

        expect(links).toHaveLength(1)
        expect(links[0]).toHaveAccessibleName('gpt-5')
        expect(links[0]).toHaveAttribute('href', '/traces?model=gpt-5')
        expect(screen.getByText('mini').closest('a')).toBeNull()
    })

    it('takes a class name on the list and on an item', () => {
        const { container } = render(
            <RankedList className="a">
                <RankedListItem
                    label="x"
                    value="1"
                    share={null}
                    className="b"
                />
            </RankedList>,
        )

        expect(container.querySelector('ol')).toHaveClass('a')
        expect(container.querySelector('li')).toHaveClass('b')
    })
})
