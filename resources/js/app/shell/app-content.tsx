import { Outlet } from 'react-router'
import { useSessionIssue } from '@/app/providers/session-issue'
import { ErrorState } from '@/components/patterns/error-state'
import { RecordingNotice, useMetaStatus } from '@/features/meta'
import { SetupScreen } from '@/features/setup'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { reloadPage } from '@/lib/reload-page'

/**
 * What fills the content area, decided once here so no page handles any of it. In order of
 * precedence, the first that applies wins:
 *
 * 1. the session ended or access was lost (any request answered 401, 403 or 419): nothing on
 *    screen can be trusted or refreshed until the page is reloaded;
 * 2. the API cannot be reached and there is no cached meta to show: the dashboard has nothing;
 * 3. no run has ever been recorded: one setup screen instead of empty pages;
 * 4. the routed page, with the notice that recording is paused above it.
 *
 * While the very first meta request is pending and nothing is cached, the content area is empty
 * (the shell stays): the page is not mounted, so it fires no queries behind a setup screen, and
 * nothing flashes before the answer. If that request fails with an answer (404, 422, 500) the
 * page renders as usual; a failure with no response is the unreachable state.
 */
export function AppContent() {
    const session = useSessionIssue()
    const meta = useMetaStatus()
    const state = session
        ? 'session'
        : meta.unreachable
          ? 'unreachable'
          : meta.loading
            ? 'loading'
            : meta.firstRun
              ? 'first-run'
              : 'page'

    // When what replaced the page goes away, or the page goes away, focus must not stay lost on
    // the body: it moves to the heading, but only if it had fallen there.
    useFocusHandoff(state !== 'page' && state !== 'loading')
    useFocusHandoff(state === 'page')

    if (state === 'loading') {
        return null
    }

    if (session) {
        return (
            <ErrorState
                title={
                    session === 'ended'
                        ? 'Your session has ended'
                        : 'You no longer have access to this dashboard'
                }
                headingLevel={1}
                description={
                    session === 'ended'
                        ? 'Reload the page to sign in again.'
                        : 'Ask whoever manages this application to give you access, then reload the page.'
                }
                retryLabel="Reload"
                onRetry={reloadPage}
            />
        )
    }

    if (meta.unreachable) {
        return (
            <ErrorState
                title="The dashboard could not reach the application"
                headingLevel={1}
                error={meta.unreachable}
                onRetry={meta.retry}
                retrying={meta.retrying}
            />
        )
    }

    if (meta.firstRun) {
        return <SetupScreen recording={meta.recording} />
    }

    return (
        <>
            <RecordingNotice />
            <Outlet />
        </>
    )
}
