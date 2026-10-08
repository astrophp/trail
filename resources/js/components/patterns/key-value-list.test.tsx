import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'

describe('KeyValueList', () => {
    it('is a description list of labels and values', () => {
        const { container } = render(
            <KeyValueList>
                <KeyValue label="Model">gpt-5</KeyValue>
                <KeyValue label="Provider">openai</KeyValue>
            </KeyValueList>,
        )

        const list = container.querySelector('dl')

        expect(list).not.toBeNull()
        expect(list?.querySelectorAll('dt')).toHaveLength(2)
        expect(list?.querySelectorAll('dd')).toHaveLength(2)
        expect(screen.getByText('Model')).toBeVisible()
        expect(screen.getByText('gpt-5')).toBeVisible()
        expect(
            screen.getByText('Provider').nextElementSibling,
        ).toHaveTextContent('openai')
    })

    it('has one column unless it is given two', () => {
        const { container, rerender } = render(
            <KeyValueList>
                <KeyValue label="a">1</KeyValue>
            </KeyValueList>,
        )

        expect(container.querySelector('dl')).toHaveClass('grid-cols-1')
        expect(container.querySelector('dl')).not.toHaveClass('md:grid-cols-2')

        rerender(
            <KeyValueList columns="two">
                <KeyValue label="a">1</KeyValue>
            </KeyValueList>,
        )

        expect(container.querySelector('dl')).toHaveClass('md:grid-cols-2')
    })

    it('takes a class name', () => {
        const { container } = render(
            <KeyValueList className="extra">
                <KeyValue label="a">1</KeyValue>
            </KeyValueList>,
        )

        expect(container.querySelector('dl')).toHaveClass('extra')
    })

    it('is a table of rows in the rows layout, whatever columns it is given', () => {
        const { container } = render(
            <KeyValueList layout="rows" columns="two">
                <KeyValue label="a">1</KeyValue>
                <KeyValue label="b">2</KeyValue>
            </KeyValueList>,
        )

        const list = container.querySelector('dl')

        expect(list).toHaveAttribute('data-layout', 'rows')
        expect(list).toHaveClass('flex', 'flex-col')
        expect(list).not.toHaveClass('grid')
        expect(list).not.toHaveClass('md:grid-cols-2')
    })

    it('stays a grid of stacked pairs by default', () => {
        const { container } = render(
            <KeyValueList>
                <KeyValue label="a">1</KeyValue>
            </KeyValueList>,
        )

        expect(container.querySelector('dl')).toHaveAttribute(
            'data-layout',
            'stack',
        )
        expect(container.querySelector('dl')).toHaveClass('grid')
    })
})
