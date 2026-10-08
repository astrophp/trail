import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from '@/components/patterns/copy-button'

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function stubClipboard(writeText: (text: string) => Promise<void>) {
    const stub = vi.fn(writeText)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: stub } })

    return stub
}

const press = () =>
    act(async () => {
        // Not user-event: it installs a clipboard of its own on `navigator`, hiding the stub under test.
        fireEvent.click(button())
        await Promise.resolve()
    })

const button = () => screen.getByRole('button', { name: 'Copy run id' })

describe('CopyButton', () => {
    it('copies the text and says so', async () => {
        const writeText = stubClipboard(() => Promise.resolve())
        const onCopied = vi.fn()
        const onFailed = vi.fn()
        render(
            <CopyButton
                text="abc-123"
                label="Copy run id"
                onCopied={onCopied}
                onFailed={onFailed}
            />,
        )

        await press()

        expect(writeText).toHaveBeenCalledWith('abc-123')
        expect(onCopied).toHaveBeenCalledTimes(1)
        expect(onFailed).not.toHaveBeenCalled()
        expect(button()).toHaveAttribute('data-copied', 'true')
    })

    it('keeps its name after a copy, and drops the check after a moment', async () => {
        stubClipboard(() => Promise.resolve())
        vi.useFakeTimers()
        render(<CopyButton text="abc" label="Copy run id" />)

        await press()
        expect(button()).toHaveAttribute('data-copied')

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000)
        })

        expect(button()).not.toHaveAttribute('data-copied')
    })

    it('says so when the browser refuses', async () => {
        stubClipboard(() => Promise.reject(new Error('denied')))
        const onCopied = vi.fn()
        const onFailed = vi.fn()
        render(
            <CopyButton
                text="abc"
                label="Copy run id"
                onCopied={onCopied}
                onFailed={onFailed}
            />,
        )

        await press()

        expect(onFailed).toHaveBeenCalledTimes(1)
        expect(onCopied).not.toHaveBeenCalled()
        expect(button()).not.toHaveAttribute('data-copied')
    })

    it('says so when there is no clipboard', async () => {
        vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
        const onCopied = vi.fn()
        const onFailed = vi.fn()
        render(
            <CopyButton
                text="abc"
                label="Copy run id"
                onCopied={onCopied}
                onFailed={onFailed}
            />,
        )

        await press()

        expect(onFailed).toHaveBeenCalledTimes(1)
        expect(onCopied).not.toHaveBeenCalled()
    })

    it('works without callbacks and accepts a className', async () => {
        stubClipboard(() => Promise.resolve())
        render(<CopyButton text="abc" label="Copy run id" className="extra" />)

        await press()

        expect(button()).toHaveClass('extra')
    })
})
