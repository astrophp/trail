import { Link } from 'react-router'
import type { AgentListView } from '@/api/agent-list-view'
import { failureMessage } from '@/api/client'
import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelEmpty } from '@/components/patterns/panel-empty'
import { PanelError } from '@/components/patterns/panel-error'
import { PanelHeader } from '@/components/patterns/panel-header'
import { PanelLoading } from '@/components/patterns/panel-loading'
import { Button } from '@/components/ui/button'
import { AgentsTable } from '@/features/agents/agents-table'
import { useAgents } from '@/features/agents/use-agents'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { useListStatus } from '@/hooks/use-list-status'
import { useTimeRange } from '@/hooks/use-time-range'
import { timeRangeParam, type TimeRangePreset } from '@/lib/time-range'
import { writeState } from '@/lib/url-state'

/** How many agents the panel shows: the busiest ones. */
const shown = 5

/** The first page of the agents with the most runs in a range, with no search. */
const viewOf = (range: TimeRangePreset): AgentListView => ({
    range,
    sort: '-runs',
    page: 1,
    search: '',
})

/** The agents list for a range, written with the list's own range parameter. */
function agentsLink(range: TimeRangePreset) {
    const search = writeState(
        { range: timeRangeParam },
        new URLSearchParams(),
        { range },
    ).toString()

    return { pathname: '/agents', search: search === '' ? '' : `?${search}` }
}

/**
 * The busiest agents of the range with how reliably, how fast and at what cost they ran: the
 * first rows of the Agents page's table, with a link to the rest. The list is a request of its
 * own, so it has its own states: a failure here leaves the rest of the page as it is. While the
 * next range loads, the previous range's rows stay, dimmed, and the link keeps the range they
 * were counted over.
 */
export function AgentPerformance({ className }: { className?: string }) {
    const [range] = useTimeRange()
    const view = viewOf(range)
    const { data, isError, error, refetch, isFetching, isPlaceholderData } =
        useAgents(view, shown)
    const { failed, retrying, loading, empty, failure } = useListStatus({
        data,
        isError,
        error,
        isFetching,
        isPlaceholderData,
        // One short page with no paging of its own: there is no page to move to.
        page: 1,
        setPage: () => {},
        viewKey: JSON.stringify(view),
    })

    // The retry button goes away when the rows replace it.
    useFocusHandoff(failed)

    // The range the rows were counted over: the previous one while the next loads.
    const counted = data?.range.preset ?? range

    return (
        <Panel className={className}>
            <PanelHeader
                title="Agent performance"
                description="The busiest agents by runs, with their error rate, speed and cost."
                action={
                    <Button asChild variant="link" size="sm">
                        <Link to={agentsLink(counted)}>View agents</Link>
                    </Button>
                }
            />
            {failed ? (
                <PanelContent>
                    <PanelError
                        title="The agents could not be loaded"
                        message={failureMessage(failure)}
                        onRetry={() => {
                            if (!retrying) {
                                void refetch()
                            }
                        }}
                    />
                </PanelContent>
            ) : loading ? (
                <PanelContent>
                    <PanelLoading rows={4} />
                </PanelContent>
            ) : empty ? (
                <PanelContent>
                    <PanelEmpty title="No agents ran in this range" />
                </PanelContent>
            ) : (
                // The table fills the panel: its own border would double the panel's.
                <PanelContent className="p-0">
                    <AgentsTable
                        agents={data?.data ?? []}
                        range={counted}
                        sort="-runs"
                        busy={isPlaceholderData}
                        caption="The busiest agents of the selected range"
                        className="rounded-none border-0 border-t"
                    />
                </PanelContent>
            )}
        </Panel>
    )
}
