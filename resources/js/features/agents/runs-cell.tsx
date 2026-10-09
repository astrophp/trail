import type { Agent } from '@/api/types'
import { formatCount } from '@/lib/format'

/**
 * How many runs the agent made of its own, and under it, as a figure of its own, how many times
 * it was delegated to. The two are never added. An agent seen only as a sub-agent has no runs of
 * its own: it says so instead of a zero.
 *
 * On a phone the lines may wrap, but never inside "Sub-agent" or between a count and "delegated".
 */
export function RunsCell({ agent }: { agent: Agent }) {
    const { top_level: own, delegated } = agent

    return (
        <div className="flex flex-col items-end gap-1 leading-normal whitespace-normal xs:whitespace-nowrap">
            {own === null ? (
                <span className="text-muted-foreground">
                    <span className="whitespace-nowrap">Sub-agent</span> only
                </span>
            ) : (
                <span>{formatCount(own.runs.all)}</span>
            )}
            {delegated === null ? null : (
                <span className="text-caption text-muted-foreground">
                    <span className="whitespace-nowrap">
                        {formatCount(delegated.all)} delegated
                    </span>{' '}
                    {delegated.all === 1 ? 'run' : 'runs'}
                </span>
            )}
        </div>
    )
}
