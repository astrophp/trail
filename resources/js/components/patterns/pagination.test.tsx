import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Pagination } from '@/components/patterns/pagination'

const noun = { one: 'trace', other: 'traces' }

function renderPagination(
    props: Partial<React.ComponentProps<typeof Pagination>> = {},
) {
    const onPageChange = vi.fn()

    const view = render(
        <Pagination
            page={1}
            perPage={12}
            total={1284}
            lastPage={107}
            noun={noun}
            onPageChange={onPageChange}
            {...props}
        />,
    )

    return { ...view, onPageChange }
}

const previous = () => screen.getByRole('button', { name: 'Previous page' })
const next = () => screen.getByRole('button', { name: 'Next page' })

describe('Pagination', () => {
    it('is a navigation landmark whose summary is a live region', () => {
        renderPagination({ className: 'extra' })

        expect(
            screen.getByRole('navigation', { name: 'Pagination' }),
        ).toHaveClass('extra')
        expect(screen.getByRole('status')).toHaveTextContent(
            '1–12 of 1,284 traces',
        )
    })

    it('shows the range and the page on the first page', () => {
        renderPagination()

        expect(screen.getByText('1–12 of 1,284 traces')).toBeInTheDocument()
        expect(screen.getByText('Page 1 of 107')).toBeInTheDocument()
    })

    it('shows the range of a middle page, with thousands separators', () => {
        renderPagination({ page: 50, perPage: 12 })

        expect(screen.getByText('589–600 of 1,284 traces')).toBeInTheDocument()
        expect(screen.getByText('Page 50 of 107')).toBeInTheDocument()
    })

    it('ends the range at the total on a partial last page', () => {
        renderPagination({ page: 52, perPage: 25, lastPage: 52 })

        expect(
            screen.getByText('1,276–1,284 of 1,284 traces'),
        ).toBeInTheDocument()
        expect(screen.getByText('Page 52 of 52')).toBeInTheDocument()
    })

    it('shows a single page', () => {
        renderPagination({ total: 7, lastPage: 1 })

        expect(screen.getByText('1–7 of 7 traces')).toBeInTheDocument()
        expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
        expect(previous()).toHaveAttribute('aria-disabled', 'true')
        expect(next()).toHaveAttribute('aria-disabled', 'true')
    })

    it('shows no range for no results', () => {
        renderPagination({ total: 0, lastPage: 1 })

        expect(screen.getByText('0 traces')).toBeInTheDocument()
        expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
    })

    it('uses the singular for exactly one', () => {
        renderPagination({ total: 1, lastPage: 1 })

        expect(screen.getByText('1 of 1 trace')).toBeInTheDocument()
    })

    it('treats a page past the end as the last page', async () => {
        const { onPageChange } = renderPagination({ page: 500 })

        expect(
            screen.getByText('1,273–1,284 of 1,284 traces'),
        ).toBeInTheDocument()
        expect(screen.getByText('Page 107 of 107')).toBeInTheDocument()
        expect(next()).toHaveAttribute('aria-disabled', 'true')

        await userEvent.click(previous())
        expect(onPageChange).toHaveBeenLastCalledWith(106)
    })

    it('copes with a perPage below one', () => {
        renderPagination({ perPage: 0, total: 5, lastPage: 5 })

        expect(screen.getByText('1 of 5 traces')).toBeInTheDocument()
    })

    it('marks the ends as disabled, and does not emit from them', async () => {
        const { onPageChange } = renderPagination()

        expect(previous()).toHaveAttribute('aria-disabled', 'true')
        expect(next()).toHaveAttribute('aria-disabled', 'false')

        await userEvent.click(previous())
        expect(onPageChange).not.toHaveBeenCalled()
    })

    it('asks for the page before and after', async () => {
        const { onPageChange } = renderPagination({ page: 5 })

        await userEvent.click(previous())
        expect(onPageChange).toHaveBeenLastCalledWith(4)

        await userEvent.click(next())
        expect(onPageChange).toHaveBeenLastCalledWith(6)
    })

    it('keeps focus on Next after it reaches the last page', async () => {
        function Stateful() {
            const [page, setPage] = useState(106)

            return (
                <Pagination
                    page={page}
                    perPage={12}
                    total={1284}
                    lastPage={107}
                    noun={noun}
                    onPageChange={setPage}
                />
            )
        }

        render(<Stateful />)

        next().focus()
        await userEvent.keyboard('{Enter}')

        expect(screen.getByText('Page 107 of 107')).toBeInTheDocument()
        expect(next()).toHaveAttribute('aria-disabled', 'true')
        expect(next()).toHaveFocus()
    })
})
