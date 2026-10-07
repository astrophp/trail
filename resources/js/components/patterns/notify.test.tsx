import { act, render, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@/app/providers/theme-provider'
import { notify } from '@/components/patterns/notify'
import { Toaster } from '@/components/ui/sonner'

afterEach(() => {
    act(() => {
        toast.dismiss()
    })
    vi.restoreAllMocks()
})

function mount() {
    render(
        <ThemeProvider>
            <Toaster />
        </ThemeProvider>,
    )
}

describe('notify', () => {
    it('shows a success', async () => {
        mount()

        act(() => notify.success('Saved.'))

        expect(await screen.findByText('Saved.')).toBeVisible()
    })

    it('shows an error', async () => {
        mount()

        act(() => notify.error('Could not save.'))

        expect(await screen.findByText('Could not save.')).toBeVisible()
    })

    it('keeps an error up longer than a success', () => {
        const success = vi.spyOn(toast, 'success')
        const error = vi.spyOn(toast, 'error')
        mount()

        act(() => {
            notify.success('Saved.')
            notify.error('Could not save.')
        })

        const [, successOptions] = success.mock.calls[0] ?? []
        const [, errorOptions] = error.mock.calls[0] ?? []

        expect(successOptions?.duration).toBeUndefined()
        expect(errorOptions?.duration).toBeGreaterThan(4000)
    })
})
