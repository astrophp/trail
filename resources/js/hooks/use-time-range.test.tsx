import { act, render, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { useTimeRange } from '@/hooks/use-time-range'

function renderAt(url: string) {
    const result = {
        current: undefined as unknown as ReturnType<typeof useTimeRange>,
    }

    function Probe() {
        result.current = useTimeRange()

        return null
    }

    window.history.replaceState({}, '', url)
    render(
        <BrowserRouter>
            <Probe />
        </BrowserRouter>,
    )

    return result
}

describe('useTimeRange', () => {
    it('reads the range, defaulting to 24 hours for a missing or unknown one', () => {
        expect(renderAt('/?range=7d').current[0]).toBe('7d')
        expect(renderAt('/').current[0]).toBe('24h')
        expect(renderAt('/?range=forever').current[0]).toBe('24h')
    })

    it('drops the page and keeps the other parameters when the range changes, in one entry', async () => {
        const result = renderAt('/?range=7d&page=3&sort=-cost&q=a')
        const entries = window.history.length

        act(() => result.current[1]('1h'))

        await waitFor(() =>
            expect(window.location.search).toBe('?sort=-cost&q=a&range=1h'),
        )
        expect(window.history.length).toBe(entries + 1)
    })

    it('leaves the default range out of the URL', async () => {
        const result = renderAt('/?range=7d&page=2')

        act(() => result.current[1]('24h'))

        await waitFor(() => expect(window.location.search).toBe(''))
    })
})
