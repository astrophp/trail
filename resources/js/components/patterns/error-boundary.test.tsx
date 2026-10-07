import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '@/components/patterns/error-boundary'

let broken = true

function Fragile() {
    if (broken) {
        throw new Error('render failed')
    }

    return <p>All well</p>
}

beforeEach(() => {
    broken = true
    // React logs a caught render error; keep the output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
    it('renders its children while nothing throws', () => {
        broken = false
        render(
            <ErrorBoundary fallback={() => <p>Fallback</p>}>
                <Fragile />
            </ErrorBoundary>,
        )

        expect(screen.getByText('All well')).toBeVisible()
    })

    it('catches a render error and shows the fallback with the error', () => {
        render(
            <ErrorBoundary
                fallback={(error) => (
                    <p>
                        Caught: {error instanceof Error ? error.message : '?'}
                    </p>
                )}
            >
                <Fragile />
            </ErrorBoundary>,
        )

        expect(screen.getByText('Caught: render failed')).toBeVisible()
    })

    it('renders the children again when the fallback calls reset', async () => {
        render(
            <ErrorBoundary
                fallback={(_error, reset) => (
                    <button onClick={reset}>Reset</button>
                )}
            >
                <Fragile />
            </ErrorBoundary>,
        )

        broken = false
        await userEvent.click(screen.getByRole('button', { name: 'Reset' }))

        expect(screen.getByText('All well')).toBeVisible()
    })

    it('shows the fallback again when the children still throw after a reset', async () => {
        render(
            <ErrorBoundary
                fallback={(_error, reset) => (
                    <button onClick={reset}>Reset</button>
                )}
            >
                <Fragile />
            </ErrorBoundary>,
        )

        await userEvent.click(screen.getByRole('button', { name: 'Reset' }))

        expect(screen.getByRole('button', { name: 'Reset' })).toBeVisible()
    })

    describe('with a reset key', () => {
        function Host({ initial = 'a' }: { initial?: string }) {
            const [key, setKey] = useState(initial)

            return (
                <>
                    <button onClick={() => setKey('b')}>Go</button>
                    <button onClick={() => setKey(key)}>Same</button>
                    <ErrorBoundary
                        resetKey={key}
                        fallback={() => <p>Fallback</p>}
                    >
                        <Fragile />
                    </ErrorBoundary>
                </>
            )
        }

        it('stays on the fallback while the key is the same, and resets when it changes', async () => {
            const { rerender } = render(<Host />)
            expect(screen.getByText('Fallback')).toBeVisible()

            // Fixing the cause alone does not bring the children back, nor does a re-render.
            broken = false
            rerender(<Host />)
            await userEvent.click(screen.getByRole('button', { name: 'Same' }))
            expect(screen.getByText('Fallback')).toBeVisible()

            await userEvent.click(screen.getByRole('button', { name: 'Go' }))

            expect(screen.getByText('All well')).toBeVisible()
        })

        it('catches the children again when they still throw after the key changed', async () => {
            render(<Host />)

            await userEvent.click(screen.getByRole('button', { name: 'Go' }))

            expect(screen.getByText('Fallback')).toBeVisible()
        })
    })

    describe('onReset', () => {
        it('is called once the children are back after reset, with their markup in place', async () => {
            let seen: string | null = null
            render(
                <ErrorBoundary
                    onReset={() => {
                        seen = document.body.textContent
                    }}
                    fallback={(_error, reset) => (
                        <button onClick={reset}>Reset</button>
                    )}
                >
                    <Fragile />
                </ErrorBoundary>,
            )

            broken = false
            await userEvent.click(screen.getByRole('button', { name: 'Reset' }))

            expect(seen).toBe('All well')
        })

        it('is not called when the children throw again, nor on a key change', async () => {
            const onReset = vi.fn()
            const { rerender } = render(
                <ErrorBoundary
                    resetKey="a"
                    onReset={onReset}
                    fallback={(_error, reset) => (
                        <button onClick={reset}>Reset</button>
                    )}
                >
                    <Fragile />
                </ErrorBoundary>,
            )

            await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
            broken = false
            rerender(
                <ErrorBoundary
                    resetKey="b"
                    onReset={onReset}
                    fallback={() => <p>Fallback</p>}
                >
                    <Fragile />
                </ErrorBoundary>,
            )

            expect(screen.getByText('All well')).toBeVisible()
            expect(onReset).not.toHaveBeenCalled()
        })
    })
})
