import type { PendingApproval } from '@/api/types'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import { PayloadViewer } from '@/components/patterns/payload-viewer'
import { cn } from '@/lib/utils'

type PendingApprovalListProps = {
    approvals: readonly PendingApproval[]
    className?: string
}

/** The tool calls a run waits for a decision on: the tool, the call's id, the reason and the arguments. */
export function PendingApprovalList({
    approvals,
    className,
}: PendingApprovalListProps) {
    return (
        <ul
            data-slot="pending-approval-list"
            className={cn('flex flex-col gap-4', className)}
        >
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
    )
}
