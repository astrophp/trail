import type { ReactNode } from 'react'
import { tracesLinkFor, type TracesLinker } from '@/api/traces-link'
import type { AgentResponse } from '@/api/types'
import { BusyRegion } from '@/components/patterns/busy-region'
import { Notice } from '@/components/patterns/notice'
import { ActivityChart } from '@/components/telemetry/activity-chart'
import type { ActivityMode } from '@/components/telemetry/activity-mode'
import { AttentionSection } from '@/components/telemetry/attention-section'
import { SummaryStrip } from '@/components/telemetry/summary-strip'
import { AgentBreakdown } from '@/features/agents/agent-breakdown'
import { agentTitle } from '@/features/agents/agent-words'
import { DelegatedFacts } from '@/features/agents/delegated-facts'
import { formatCount } from '@/lib/format'
import type { Refreshing } from '@/lib/refresh-policy'
import type { TimeRangePreset } from '@/lib/time-range'

type AgentLoadedProps = {
    /** The agent as the address names it, which the models and tools are asked for. */
    name: string
    answer: AgentResponse['data']
    /** The range of the answer: the previous one while the next loads. */
    range: TimeRangePreset
    /** The range chosen, which the models and tools are asked for: they do not wait for the figures. */
    selected: TimeRangePreset
    /** The answer is the previous range's, and shown until the next arrives. */
    placeholder: boolean
    /** The link to the agent's runs for a figure of the strip. */
    link: TracesLinker
    mode: ActivityMode
    onModeChange: (mode: ActivityMode) => void
    /** What the page places under the models and tools; drawn for an agent with runs of its own. */
    recent?: ReactNode
    /** The page's one query for the agent. */
    leader: {
        dataUpdatedAt: number
        isPlaceholderData: boolean
        refreshing: Refreshing
    }
    /** The page already says its last refresh failed. */
    refreshNoted: boolean
}

/**
 * An agent that has something in the range, drawn by what it is. One with runs of its own has the
 * strip of its figures, its activity, what needs a look, its models and tools, and its recent
 * runs. One that only ran as a sub-agent has none of those runs' figures (they do not exist, and
 * zeros would claim them), the few facts known, and the models and tools used inside the runs that
 * delegated to it. One that did nothing in the range has a notice saying so, and nothing else.
 */
export function AgentLoaded({
    name,
    answer,
    range,
    selected,
    placeholder,
    link,
    mode,
    onModeChange,
    recent,
    leader,
    refreshNoted,
}: AgentLoadedProps) {
    const { agent, summary, previous, series, attention } = answer
    const own = agent.top_level
    const delegated = agent.delegated

    if (own === null && delegated === null) {
        return (
            <Notice tone="info" title="Nothing ran in this range.">
                <span className="wrap-anywhere whitespace-pre-wrap">
                    {agentTitle(agent.name)}
                </span>
                {agent.agent_class === null ? null : (
                    <>
                        {' ('}
                        <span className="font-mono text-xs wrap-anywhere">
                            {agent.agent_class}
                        </span>
                        {')'}
                    </>
                )}{' '}
                was recorded, but no run started under this name in the selected
                range, as itself or as a sub-agent.
                {range === '7d' ? null : ' Try a longer range.'}
            </Notice>
        )
    }

    if (own === null) {
        return (
            <>
                {/* Outside the busy region: a status message is not part of what is dimmed. */}
                <Notice
                    tone="info"
                    title="It has no runs of its own in this range."
                    className="mb-4"
                >
                    Its runs are recorded inside the runs of the agents that
                    delegated to it, so its figures are part of theirs.
                </Notice>
                {delegated === null ? null : (
                    <BusyRegion busy={placeholder} label="Loading the figures">
                        <DelegatedFacts delegated={delegated} />
                    </BusyRegion>
                )}
                <AgentBreakdown
                    name={name}
                    range={selected}
                    ownRuns={null}
                    leader={leader}
                    refreshNoted={refreshNoted}
                    className="mt-6"
                />
            </>
        )
    }

    return (
        <>
            <BusyRegion busy={placeholder} label="Loading the figures">
                <SummaryStrip
                    summary={summary}
                    previous={previous}
                    range={range}
                    link={link}
                    tracesDetail={
                        delegated === null
                            ? undefined
                            : `${formatCount(delegated.all)} delegated ${delegated.all === 1 ? 'run' : 'runs'}`
                    }
                />
            </BusyRegion>
            <div className="mt-6 flex flex-col gap-4">
                <ActivityChart
                    series={series}
                    summary={summary}
                    mode={mode}
                    onModeChange={onModeChange}
                    busy={placeholder}
                />
                <AttentionSection
                    items={attention}
                    range={range}
                    linkFor={tracesLinkFor}
                    busy={placeholder}
                />
                <AgentBreakdown
                    name={name}
                    range={selected}
                    ownRuns={{ runs: own.runs.all, range }}
                    leader={leader}
                    refreshNoted={refreshNoted}
                />
                {recent}
            </div>
        </>
    )
}
