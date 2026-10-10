import { ListTreeIcon, MessageSquareIcon, SearchIcon } from 'lucide-react'
import type { To } from 'react-router'
import { agentsLink } from '@/api/agents-link'
import { tracesLink } from '@/api/traces-link'
import type { Agent, Conversation, SearchResponse, Trace } from '@/api/types'
import {
    CommandPaletteGroup,
    CommandPaletteItem,
    CommandPaletteLink,
    CommandPaletteRow,
} from '@/components/patterns/command-palette'
import { AgentIcon } from '@/components/telemetry/agent-icon'
import { NounCount } from '@/components/telemetry/noun-count'
import { StatusBadge } from '@/components/telemetry/status-badge'
import { Timestamp } from '@/components/telemetry/timestamp'
import { TraceId } from '@/components/telemetry/trace-id'
import { agentPath } from '@/lib/agent-path'
import { conversationPath } from '@/lib/conversation-path'
import type { TimeRangePreset } from '@/lib/time-range'
import { tracePagePath } from '@/lib/trace-page-path'

type Navigate = {
    /** Chooses an option with the keyboard: go there and close. */
    go: (to: To) => void
    /** A plain click on an option's link went there: close. */
    followed: () => void
}

/** The runs, conversations and agents of a search, each in its own group, as links. */
export function SearchGroups({
    response,
    range,
    go,
    followed,
}: {
    response: SearchResponse
    range: TimeRangePreset
} & Navigate) {
    const { traces, conversations, agents } = response.data
    const { q } = response.query
    const { limits } = response

    return (
        <>
            {traces.length === 0 ? null : (
                <CommandPaletteGroup heading="Runs">
                    {traces.map((trace) => (
                        <RunOption
                            key={trace.id}
                            trace={trace}
                            go={go}
                            followed={followed}
                        />
                    ))}
                    {limits.traces.truncated ? (
                        <MoreOption
                            value="more:traces"
                            to={tracesLink(range, { search: q })}
                            label="Show all matching runs"
                            icon={<ListTreeIcon />}
                            meta="Traces"
                            go={go}
                            followed={followed}
                        />
                    ) : null}
                </CommandPaletteGroup>
            )}
            {conversations.length === 0 ? null : (
                <CommandPaletteGroup heading="Conversations">
                    {conversations.map((conversation) => (
                        <ConversationOption
                            key={conversation.id}
                            conversation={conversation}
                            go={go}
                            followed={followed}
                        />
                    ))}
                </CommandPaletteGroup>
            )}
            {agents.length === 0 ? null : (
                <CommandPaletteGroup heading="Agents">
                    {agents.map((agent) => (
                        <AgentOption
                            key={agent.name}
                            agent={agent}
                            range={range}
                            go={go}
                            followed={followed}
                        />
                    ))}
                    {limits.agents.truncated ? (
                        <MoreOption
                            value="more:agents"
                            to={agentsLink(range, { search: q })}
                            label="Show all matching agents"
                            icon={<SearchIcon />}
                            meta="Agents"
                            go={go}
                            followed={followed}
                        />
                    ) : null}
                </CommandPaletteGroup>
            )}
        </>
    )
}

function RunOption({ trace, go, followed }: { trace: Trace } & Navigate) {
    const to = tracePagePath(trace.id)

    return (
        <CommandPaletteItem value={`run:${trace.id}`} onSelect={() => go(to)}>
            <CommandPaletteLink to={to} onFollow={followed}>
                <CommandPaletteRow
                    icon={<StatusBadge status={trace.status} iconOnly />}
                    meta={
                        <>
                            <TraceId id={trace.id} className="max-sm:sr-only" />
                            <Timestamp
                                at={trace.started_at}
                                layout="relative"
                            />
                        </>
                    }
                >
                    <span className="font-medium">{trace.name}</span>{' '}
                    <span className="text-muted-foreground">
                        {trace.prompt_excerpt ?? 'No prompt stored'}
                    </span>
                </CommandPaletteRow>
            </CommandPaletteLink>
        </CommandPaletteItem>
    )
}

function ConversationOption({
    conversation,
    go,
    followed,
}: { conversation: Conversation } & Navigate) {
    const to = conversationPath(conversation.id)
    const turns = conversation.turns.all

    return (
        <CommandPaletteItem
            value={`conversation:${conversation.id}`}
            onSelect={() => go(to)}
        >
            <CommandPaletteLink to={to} onFollow={followed}>
                <CommandPaletteRow
                    icon={<MessageSquareIcon />}
                    meta={
                        <>
                            <NounCount
                                count={turns}
                                singular="turn"
                                plural="turns"
                            />
                            <Timestamp
                                at={conversation.last_activity_at}
                                layout="relative"
                            />
                        </>
                    }
                >
                    <span className="font-mono">{conversation.id}</span>
                </CommandPaletteRow>
            </CommandPaletteLink>
        </CommandPaletteItem>
    )
}

function AgentOption({
    agent,
    range,
    go,
    followed,
}: { agent: Agent; range: TimeRangePreset } & Navigate) {
    const to = agentPath(agent.name, { range })
    const own = agent.top_level
    const unnamed = agent.name.trim() === ''

    return (
        <CommandPaletteItem
            value={`agent:${agent.name}`}
            onSelect={() => go(to)}
        >
            <CommandPaletteLink to={to} onFollow={followed}>
                <CommandPaletteRow
                    icon={<AgentIcon type={agent.type} />}
                    meta={
                        own === null ? (
                            <span>
                                <span className="whitespace-nowrap">
                                    Sub-agent
                                </span>{' '}
                                only
                            </span>
                        ) : (
                            <NounCount
                                count={own.runs.all}
                                singular="run"
                                plural="runs"
                            />
                        )
                    }
                >
                    <span className={unnamed ? 'text-muted-foreground' : ''}>
                        {unnamed ? 'Unnamed agent' : agent.name}
                    </span>
                </CommandPaletteRow>
            </CommandPaletteLink>
        </CommandPaletteItem>
    )
}

/** The last option of a group that was cut: the list that holds the rest, with this search applied. */
function MoreOption({
    value,
    to,
    label,
    icon,
    meta,
    go,
    followed,
}: {
    value: string
    to: To
    label: string
    icon: React.ReactNode
    meta: string
} & Navigate) {
    return (
        <CommandPaletteItem value={value} onSelect={() => go(to)}>
            <CommandPaletteLink to={to} onFollow={followed}>
                <CommandPaletteRow icon={icon} meta={meta}>
                    <span className="text-muted-foreground">{label}</span>
                </CommandPaletteRow>
            </CommandPaletteLink>
        </CommandPaletteItem>
    )
}
