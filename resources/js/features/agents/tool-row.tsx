import type { To } from 'react-router'
import type { AgentTool, DelegatedTool } from '@/api/types'
import { RankedListItem } from '@/components/patterns/ranked-list-item'
import { callsText, runsText } from '@/features/agents/breakdown-words'
import { formatCount } from '@/lib/format'

type ToolRowProps = {
    tool: AgentTool | DelegatedTool
    /** The runs list over exactly the runs the row counted. Left out for a row that cannot be one. */
    to?: To
    /** The row should have led to its runs and could not: it says so instead of looking like one that never does. */
    unlinkable?: boolean
    /** Its part of the agent's own runs; `null` draws no bar. */
    share: number | null
}

/**
 * One tool of an agent's runs: its name, in how many runs it was called, how many calls were
 * made and how many of those failed. A count of failed calls that is zero is not said.
 */
export function ToolRow({ tool, to, unlinkable, share }: ToolRowProps) {
    return (
        <RankedListItem
            label={<span className="font-mono text-xs">{tool.name}</span>}
            value={runsText(tool.runs)}
            share={share}
            to={to}
            detail={
                <>
                    {callsText(tool.calls)}
                    {tool.failed > 0 ? (
                        <span> · {formatCount(tool.failed)} failed</span>
                    ) : null}
                    {unlinkable ? (
                        <span> · Its runs could not be linked.</span>
                    ) : null}
                </>
            }
        />
    )
}
