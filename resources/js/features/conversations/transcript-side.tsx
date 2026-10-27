import {
    ArrowDownToLineIcon,
    ArrowUpFromLineIcon,
    BotIcon,
    ClockIcon,
    CoinsIcon,
    HandIcon,
    LoaderIcon,
    MessagesSquareIcon,
    TriangleAlertIcon,
    UserIcon,
} from 'lucide-react'
import type { Conversation } from '@/api/types'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import { CostValue } from '@/components/telemetry/cost-value'
import { Timestamp } from '@/components/telemetry/timestamp'
import { TokenCount } from '@/components/telemetry/token-count'
import { UserLabel } from '@/components/telemetry/user-label'
import { JumpToTurn } from '@/features/conversations/jump-to-turn'
import { MoreCount } from '@/features/conversations/more-count'
import { SideCard } from '@/features/conversations/side-card'
import type { NumberedTurn } from '@/features/conversations/transcript-turns'
import { formatCount } from '@/lib/format'

type TranscriptSideProps = {
    conversation: Conversation
    /** The loaded turns, which the jump list links to. */
    turns: NumberedTurn[]
    onJump: (traceId: string) => void
    /** The trace id of the turn being read; see `JumpToTurn`. */
    current?: string | null
}

/**
 * Beside the transcript: a list to jump to a loaded turn, who the conversation is with, its
 * figures over all of its turns (the API's, never added up from the turns loaded), and the agents
 * that took part.
 */
export function TranscriptSide({
    conversation,
    turns,
    onJump,
    current,
}: TranscriptSideProps) {
    const { turns: counts, usage } = conversation
    const pending = usage.state === 'pending'
    const users = conversation.users
    const moreUsers = Math.max(conversation.user_count - users.length, 0)
    const moreAgents = Math.max(
        conversation.agent_count - conversation.agents.length,
        0,
    )

    return (
        <div className="flex min-w-0 flex-col gap-3">
            {/* First, so it is in reach however tall the figures below are. */}
            <JumpToTurn turns={turns} onJump={onJump} current={current} />
            {users.length === 0 && moreUsers === 0 ? null : (
                <SideCard
                    label={
                        conversation.user_count > 1
                            ? 'Application users'
                            : 'Application user'
                    }
                >
                    <ul className="flex flex-col gap-2 text-ui">
                        {users.map((user) => (
                            <li
                                key={`${user.type}:${user.id}`}
                                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2"
                            >
                                <UserIcon
                                    aria-hidden="true"
                                    className="size-3.5 text-muted-foreground"
                                />
                                <UserLabel
                                    user={user}
                                    className="font-medium"
                                />
                                {user.email === null ||
                                user.name === null ? null : (
                                    <span className="col-start-2 text-caption wrap-anywhere text-muted-foreground">
                                        {user.email}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                    <MoreCount count={moreUsers} noun="user" />
                </SideCard>
            )}
            <SideCard label="Session summary">
                <KeyValueList
                    layout="rows"
                    // A narrow column: the label takes what the value leaves, and the value sits at the right.
                    className="[&_[data-slot=key-value]]:border-b-0 [&_[data-slot=key-value]]:py-1.5 [&_dd]:flex-none! [&_dd]:justify-end [&_dd]:text-end [&_dt]:w-auto! [&_dt]:min-w-0! [&_dt]:flex-1"
                >
                    <KeyValue icon={MessagesSquareIcon} label="Recorded turns">
                        {formatCount(counts.all)}
                    </KeyValue>
                    <KeyValue
                        icon={TriangleAlertIcon}
                        label="Failed or incomplete"
                    >
                        {formatCount(counts.failed + counts.incomplete)}
                    </KeyValue>
                    {counts.running === 0 ? null : (
                        <KeyValue icon={LoaderIcon} label="Running">
                            {formatCount(counts.running)}
                        </KeyValue>
                    )}
                    {counts.awaiting_approval === 0 ? null : (
                        <KeyValue icon={HandIcon} label="Awaiting approval">
                            {formatCount(counts.awaiting_approval)}
                        </KeyValue>
                    )}
                    <KeyValue icon={ArrowDownToLineIcon} label="Input tokens">
                        <TokenCount
                            count={usage.input_tokens}
                            pending={pending}
                        />
                    </KeyValue>
                    <KeyValue icon={ArrowUpFromLineIcon} label="Output tokens">
                        <TokenCount
                            count={usage.output_tokens}
                            pending={pending}
                        />
                    </KeyValue>
                    <KeyValue icon={CoinsIcon} label="Estimated cost">
                        <CostValue cost={conversation.cost} />
                    </KeyValue>
                    <KeyValue icon={ClockIcon} label="Last activity">
                        <Timestamp
                            at={conversation.last_activity_at}
                            layout="inline"
                        />
                    </KeyValue>
                </KeyValueList>
            </SideCard>
            {conversation.agents.length === 0 && moreAgents === 0 ? null : (
                <SideCard label="Agents">
                    <ul className="flex flex-col gap-1.5 font-mono text-xs">
                        {conversation.agents.map((name) => (
                            <li
                                key={name}
                                className="flex min-w-0 items-center gap-2"
                            >
                                <BotIcon
                                    aria-hidden="true"
                                    className="size-3.5 shrink-0 text-muted-foreground"
                                />
                                <span className="min-w-0 wrap-anywhere">
                                    {name}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <MoreCount count={moreAgents} noun="agent" />
                </SideCard>
            )}
        </div>
    )
}
