import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { notify } from '@/components/patterns/notify'
import { CopyLinkButton } from '@/components/patterns/copy-link-button'

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

function stubClipboard(writeText: (text: string) => Promise<void>) {
    const stub = vi.fn(writeText)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: stub } })

    return stub
}

const press = (name: string) =>
    act(async () => {
        // Not user-event: it installs a clipboard of its own on `navigator`, hiding the stub under test.
        fireEvent.click(screen.getByRole('button', { name }))
        await Promise.resolve()
    })

function renderButton(
    props: Parameters<typeof CopyLinkButton>[0],
    basename = '/trail',
) {
    return render(
        <MemoryRouter basename={basename} initialEntries={[basename]}>
            <CopyLinkButton {...props} />
        </MemoryRouter>,
    )
}

describe('CopyLinkButton', () => {
    it('copies the whole address: origin, base path, path and query', async () => {
        const writeText = stubClipboard(() => Promise.resolve())
        const success = vi.spyOn(notify, 'success')
        renderButton({ to: '/traces/run-1?span=s2' }, '/trail')
        await press('Copy link')

        expect(writeText).toHaveBeenCalledWith(
            `${window.location.origin}/trail/traces/run-1?span=s2`,
        )
        expect(success).toHaveBeenCalledWith('Link copied.')
    })

    it('keeps an awkward query as it was written', async () => {
        const writeText = stubClipboard(() => Promise.resolve())
        renderButton({ to: '/conversations/transcript?id=a%2Fb+c&turn=r1' })
        await press('Copy link')

        expect(writeText).toHaveBeenCalledWith(
            `${window.location.origin}/trail/conversations/transcript?id=a%2Fb+c&turn=r1`,
        )
    })

    it('is named by its label when it has one, and keeps its words', () => {
        renderButton({ to: '/x', label: 'Copy link to turn 3' })

        expect(
            screen.getByRole('button', { name: 'Copy link to turn 3' }),
        ).toHaveTextContent('Copy link')
    })

    it('says so when the clipboard is missing or refuses', async () => {
        const error = vi.spyOn(notify, 'error')
        stubClipboard(() => Promise.reject(new Error('no')))
        renderButton({ to: '/x' })
        await press('Copy link')

        expect(error).toHaveBeenCalledWith('The link could not be copied.')
    })

    it('hides the words, not the name, on a narrow screen when asked to', () => {
        renderButton({ to: '/x', hideWordsWhenNarrow: true })

        expect(screen.getByText('Copy link')).toHaveClass('max-md:sr-only')
        expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible()
    })
})
