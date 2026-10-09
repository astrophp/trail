import type { ReactNode } from 'react'
import type { To } from 'react-router'
import type { UsageBreakdownRow } from '@/api/types'
import { RowLink } from '@/components/patterns/row-link'
import { AgentIcon } from '@/components/telemetry/agent-icon'
import { ModelLabel } from '@/components/telemetry/model-label'

/**
 * What a row of the breakdown is a row of: the model with its provider, the agent, or the
 * provider. With a link (`to`) the name leads to the runs behind the row, the whole row being its
 * target. A row that cannot be linked is the same text with a line saying so, so it does not look
 * like one that never leads anywhere.
 */
export function UsageKeyCell({
    row,
    to,
}: {
    row: UsageBreakdownRow
    to: To | null
}) {
    const link = (children: ReactNode, className?: string) =>
        to === null ? (
            <span className={className}>{children}</span>
        ) : (
            <RowLink to={to} className={className}>
                {children}
            </RowLink>
        )

    return (
        <div className="flex min-w-0 flex-col gap-1 leading-normal">
            {'agent' in row ? (
                <div className="flex min-w-0 items-center gap-2">
                    <AgentIcon type="agent" />
                    {link(
                        row.agent.trim() === '' ? (
                            <span className="text-muted-foreground">
                                Unnamed agent
                            </span>
                        ) : (
                            row.agent
                        ),
                        'min-w-0 wrap-anywhere',
                    )}
                </div>
            ) : 'model' in row ? (
                link(
                    <ModelLabel
                        of={{ provider: row.provider, model: row.model }}
                    />,
                    'block',
                )
            ) : (
                link(row.provider, 'wrap-anywhere')
            )}
            {to === null ? (
                <p className="text-caption text-muted-foreground">
                    Its runs could not be linked
                </p>
            ) : null}
        </div>
    )
}
