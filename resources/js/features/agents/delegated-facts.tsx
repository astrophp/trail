import type { AgentDelegated } from '@/api/types'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelHeader } from '@/components/patterns/panel-header'
import { Timestamp } from '@/components/telemetry/timestamp'
import { formatCount } from '@/lib/format'

/**
 * What is known of an agent that ran only as a sub-agent in the range. It has no runs of its own,
 * so there is no error rate, duration, cost or activity to draw (not as zeros, which would be
 * claims): a delegated run is a span of the run that delegated, with no usage or status of its
 * own. The counts follow as a table; the page's notice, outside whatever is dimmed, says where
 * its runs are recorded.
 */
export function DelegatedFacts({
    delegated,
    className,
}: {
    delegated: AgentDelegated
    className?: string
}) {
    return (
        <div className={className}>
            <Panel>
                <PanelHeader title="As a sub-agent" />
                <PanelContent>
                    <KeyValueList layout="rows">
                        <KeyValue label="Delegated runs">
                            {formatCount(delegated.all)}
                        </KeyValue>
                        <KeyValue label="Failed" nested>
                            {formatCount(delegated.failed)}
                        </KeyValue>
                        <KeyValue label="Incomplete" nested>
                            {formatCount(delegated.incomplete)}
                        </KeyValue>
                        <KeyValue label="Last delegated">
                            {/* A time that could not be read is still a row: the component says it is missing. */}
                            <Timestamp
                                at={delegated.last_activity_at ?? ''}
                                layout="relative"
                            />
                        </KeyValue>
                    </KeyValueList>
                </PanelContent>
            </Panel>
        </div>
    )
}
