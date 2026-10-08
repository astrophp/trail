import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'

const notifyMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/components/patterns/notify', () => ({ notify: notifyMock }))

beforeEach(() => {
    vi.clearAllMocks()
})

describe('KeyValue', () => {
    it('shows any node as the value', () => {
        render(
            <KeyValueList>
                <KeyValue label="Status">
                    <strong>Done</strong>
                </KeyValue>
            </KeyValueList>,
        )

        expect(screen.getByText('Done').tagName).toBe('STRONG')
    })

    it.each([null, undefined])('says Not captured for %s', (value) => {
        render(
            <KeyValueList>
                <KeyValue label="Model">{value}</KeyValue>
            </KeyValueList>,
        )

        expect(screen.getByText('Model')).toBeVisible()
        expect(screen.getByText('Not captured')).toBeVisible()
    })

    it('says the words it is given when there is no value', () => {
        render(
            <KeyValueList>
                <KeyValue label="Cost" missing="Unpriced" />
            </KeyValueList>,
        )

        expect(screen.getByText('Unpriced')).toBeVisible()
        expect(screen.queryByText('Not captured')).not.toBeInTheDocument()
    })

    it('shows a real zero rather than calling it missing', () => {
        render(
            <KeyValueList>
                <KeyValue label="Retries">{0}</KeyValue>
            </KeyValueList>,
        )

        expect(screen.getByText('0')).toBeVisible()
        expect(screen.queryByText('Not captured')).not.toBeInTheDocument()
    })

    it('treats an empty string as missing, with no copy button', () => {
        render(
            <KeyValueList>
                <KeyValue label="Model" copy="gpt-5" missing="Unknown">
                    {''}
                </KeyValue>
            </KeyValueList>,
        )

        expect(screen.getByText('Model')).toBeVisible()
        expect(screen.getByText('Unknown')).toBeVisible()
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it.each([null, undefined])(
        'has no copy button when the value is %s',
        (value) => {
            render(
                <KeyValueList>
                    <KeyValue label="Model" copy="gpt-5">
                        {value}
                    </KeyValue>
                </KeyValueList>,
            )

            expect(screen.getByText('Not captured')).toBeVisible()
            expect(screen.queryByRole('button')).not.toBeInTheDocument()
        },
    )

    it('keeps the copy button next to a real zero', () => {
        render(
            <KeyValueList>
                <KeyValue label="Retries" copy="0">
                    {0}
                </KeyValue>
            </KeyValueList>,
        )

        expect(screen.getByText('0')).toBeVisible()
        expect(
            screen.getByRole('button', { name: 'Copy Retries' }),
        ).toBeVisible()
    })

    it('has no copy button unless it has text to copy', () => {
        render(
            <KeyValueList>
                <KeyValue label="Model">gpt-5</KeyValue>
            </KeyValueList>,
        )

        expect(screen.getByText('gpt-5')).toBeVisible()
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('copies its text from a button named after the label', async () => {
        const user = userEvent.setup()
        const writeText = vi.fn().mockResolvedValue(undefined)

        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        })
        render(
            <KeyValueList>
                <KeyValue label="Trace id" copy="full-id-123">
                    full-id…
                </KeyValue>
            </KeyValueList>,
        )

        await user.click(screen.getByRole('button', { name: 'Copy Trace id' }))

        expect(writeText).toHaveBeenCalledWith('full-id-123')
        expect(notifyMock.success).toHaveBeenCalledWith('Copied Trace id')
    })

    it('reports a copy that failed', async () => {
        const user = userEvent.setup()

        Object.defineProperty(navigator, 'clipboard', {
            value: undefined,
            configurable: true,
        })
        render(
            <KeyValueList>
                <KeyValue label="Trace id" copy="x">
                    x
                </KeyValue>
            </KeyValueList>,
        )

        await user.click(screen.getByRole('button', { name: 'Copy Trace id' }))

        expect(notifyMock.error).toHaveBeenCalledWith('Could not copy Trace id')
        expect(notifyMock.success).not.toHaveBeenCalled()
    })

    it('lets a long value wrap', () => {
        render(
            <KeyValueList>
                <KeyValue label="Class">{'A'.repeat(300)}</KeyValue>
            </KeyValueList>,
        )

        expect(screen.getByText('A'.repeat(300))).toHaveClass('wrap-anywhere')
    })
})
