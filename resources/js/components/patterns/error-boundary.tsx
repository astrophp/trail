import { Component, type ReactNode } from 'react'

type ErrorBoundaryProps = {
    /** What to show once a child has thrown while rendering. `reset` tries the children again. */
    fallback: (error: unknown, reset: () => void) => ReactNode
    /** The boundary resets when this changes: pass the current location to recover on navigation. */
    resetKey?: unknown
    /** Called once the children have rendered again after `reset` (not after a `resetKey` change). */
    onReset?: () => void
    children: ReactNode
}

type ErrorBoundaryState = {
    failed: boolean
    error: unknown
    resetKey: unknown
}

/**
 * Catches an error thrown while rendering anything below it and shows `fallback` instead, so
 * the rest of the page stays alive. It catches render errors only (and those in lifecycle
 * methods): not errors in event handlers or in async code such as a failed request. A React
 * error boundary has to be a class.
 */
export class ErrorBoundary extends Component<
    ErrorBoundaryProps,
    ErrorBoundaryState
> {
    state: ErrorBoundaryState = {
        failed: false,
        error: null,
        resetKey: this.props.resetKey,
    }

    static getDerivedStateFromError(error: unknown) {
        return { failed: true, error }
    }

    static getDerivedStateFromProps(
        props: ErrorBoundaryProps,
        state: ErrorBoundaryState,
    ) {
        if (!Object.is(props.resetKey, state.resetKey)) {
            return { failed: false, error: null, resetKey: props.resetKey }
        }

        return null
    }

    private resetRequested = false

    componentDidUpdate(_: ErrorBoundaryProps, before: ErrorBoundaryState) {
        if (this.state.failed) {
            // Failed again: the next recovery is a new one.
            this.resetRequested = false
        } else if (before.failed && this.resetRequested) {
            this.resetRequested = false
            this.props.onReset?.()
        }
    }

    reset = () => {
        this.resetRequested = true
        this.setState({ failed: false, error: null })
    }

    render() {
        return this.state.failed
            ? this.props.fallback(this.state.error, this.reset)
            : this.props.children
    }
}
