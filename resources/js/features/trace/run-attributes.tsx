import type { CostState, Trace, UsageState } from '@/api/types'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import { DurationValue } from '@/components/telemetry/duration-value'
import { IssueLabel } from '@/components/telemetry/issue-label'
import { StatusBadge } from '@/components/telemetry/status-badge'
import { Timestamp } from '@/components/telemetry/timestamp'
import { UserLabel } from '@/components/telemetry/user-label'
import { LastAttempt } from '@/features/trace/last-attempt'
import { RunPanel } from '@/features/trace/run-panel'
import { formatCount } from '@/lib/format'

const costWords: Record<CostState, string> = {
    estimated: 'Estimated',
    partial: 'Partial',
    unpriced: 'Unpriced',
    pending: 'Pending',
    not_captured: 'Not captured',
}

const usageWords: Record<UsageState, string> = {
    reported: 'Reported',
    pending: 'Pending',
    not_reported: 'Not reported',
}

const yesNo = (value: boolean) => (value ? 'Yes' : 'No')

/**
 * What was recorded about the run itself, as a table. A row that does not apply to this run is
 * left out; one that should exist and does not says `Not captured`.
 */
type RunAttributesProps = {
    trace: Trace
    /** The tool calls an earlier pause settled, for a run that resumed one. */
    resolvedToolCallIds: string[]
}

export function RunAttributes({
    trace,
    resolvedToolCallIds,
}: RunAttributesProps) {
    const { user } = trace

    return (
        <RunPanel title="Recorded attributes">
            <KeyValueList layout="rows">
                <KeyValue label="Run id" copy={trace.id}>
                    <span className="font-mono text-xs">{trace.id}</span>
                </KeyValue>
                <KeyValue label="Type">
                    {trace.type === 'agent' ? 'Agent run' : 'Embedding run'}
                </KeyValue>
                <KeyValue label={trace.type === 'agent' ? 'Agent' : 'Name'}>
                    {trace.name}
                </KeyValue>
                {trace.agent_class === null ? null : (
                    <KeyValue label="Agent class">
                        <span className="font-mono text-xs">
                            {trace.agent_class}
                        </span>
                    </KeyValue>
                )}
                <KeyValue label="Status">
                    <StatusBadge status={trace.status} />
                </KeyValue>
                {trace.issue_kind === null ? null : (
                    <KeyValue label="Issue kind">
                        <IssueLabel kind={trace.issue_kind} />
                    </KeyValue>
                )}
                {trace.recovered ? (
                    <KeyValue label="Recovered">{yesNo(true)}</KeyValue>
                ) : null}
                {trace.child_failed ? (
                    <KeyValue label="Child failed">{yesNo(true)}</KeyValue>
                ) : null}
                <KeyValue label="Recording">
                    {trace.streamed ? 'Streamed' : 'Not streamed'}
                </KeyValue>
                <KeyValue label="Provider">
                    {trace.provider}
                    <LastAttempt show={trace.recovered && !!trace.provider} />
                </KeyValue>
                <KeyValue label="Requested model">
                    {trace.model === null ? null : (
                        <>
                            <span className="font-mono">{trace.model}</span>
                            <LastAttempt show={trace.recovered} />
                        </>
                    )}
                </KeyValue>
                {trace.conversation_id === null ? null : (
                    <KeyValue
                        label="Conversation id"
                        copy={trace.conversation_id}
                    >
                        <span className="font-mono text-xs">
                            {trace.conversation_id}
                        </span>
                    </KeyValue>
                )}
                {user === null ? null : (
                    <>
                        <KeyValue label="User">
                            <UserLabel user={user} />
                        </KeyValue>
                        <KeyValue label="User id">
                            <span className="font-mono text-xs">{user.id}</span>
                        </KeyValue>
                        <KeyValue label="User type">
                            <span className="font-mono text-xs">
                                {user.type}
                            </span>
                        </KeyValue>
                    </>
                )}
                <KeyValue label="Started">
                    <Timestamp at={trace.started_at} layout="full" />
                </KeyValue>
                {/* Only a run in flight has no end to show; a finished one without it says so. */}
                {trace.status === 'running' ? null : (
                    <KeyValue label="Ended">
                        {trace.ended_at === null ? null : (
                            <Timestamp at={trace.ended_at} layout="full" />
                        )}
                    </KeyValue>
                )}
                <KeyValue label="Duration">
                    <DurationValue of={trace} />
                </KeyValue>
                <KeyValue label="Spans">
                    {formatCount(trace.span_count)}
                </KeyValue>
                <KeyValue label="Cost state">
                    {costWords[trace.cost.state]}
                </KeyValue>
                <KeyValue label="Usage state">
                    {usageWords[trace.usage.state]}
                </KeyValue>
                {resolvedToolCallIds.length === 0 ? null : (
                    <KeyValue label="Resolved tool calls">
                        <ul className="flex flex-col gap-1">
                            {resolvedToolCallIds.map((id, index) => (
                                <li
                                    key={`${id}:${index}`}
                                    className="font-mono text-xs"
                                >
                                    {id}
                                </li>
                            ))}
                        </ul>
                    </KeyValue>
                )}
                <KeyValue label="Bookmarked">
                    {yesNo(trace.bookmarked)}
                </KeyValue>
            </KeyValueList>
        </RunPanel>
    )
}
