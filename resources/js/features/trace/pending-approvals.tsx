import type { PendingApproval } from '@/api/types'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import { PayloadViewer } from '@/components/patterns/payload-viewer'
import { RunPanel } from '@/features/trace/run-panel'

type PendingApprovalsProps = {
    approvals: PendingApproval[]
}

/** The tool calls a paused run waits for a decision on. */
export function PendingApprovals({ approvals }: PendingApprovalsProps) {
    return (
        <RunPanel title="Pending approvals">
            <p className="text-ui text-muted-foreground">
                A run that resumes after approval is recorded as a separate run.
            </p>
            <ul className="flex flex-col gap-4">
                {approvals.map((approval, index) => (
                    <li
                        key={`${approval.tool_call_id}:${index}`}
                        className="flex min-w-0 flex-col gap-3 rounded-lg border p-4"
                    >
                        <KeyValueList layout="rows">
                            <KeyValue label="Tool">
                                <span className="font-mono text-xs">
                                    {approval.tool}
                                </span>
                            </KeyValue>
                            <KeyValue
                                label="Tool call id"
                                copy={approval.tool_call_id}
                            >
                                <span className="font-mono text-xs">
                                    {approval.tool_call_id}
                                </span>
                            </KeyValue>
                            {approval.reason === null ? null : (
                                <KeyValue label="Reason">
                                    {approval.reason}
                                </KeyValue>
                            )}
                        </KeyValueList>
                        <PayloadViewer
                            value={approval.arguments}
                            label="arguments"
                            heading="Arguments"
                        />
                    </li>
                ))}
            </ul>
        </RunPanel>
    )
}
