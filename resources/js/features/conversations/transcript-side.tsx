import type { Conversation } from '@/api/types'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import { CostValue } from '@/components/telemetry/cost-value'
import { SectionLabel } from '@/components/telemetry/section-label'
import { Timestamp } from '@/components/telemetry/timestamp'
import { TokenCount } from '@/components/telemetry/token-count'
import { UserLabel } from '@/components/telemetry/user-label'
import { JumpToTurn } from '@/features/conversations/jump-to-turn'
import { MoreCount } from '@/features/conversations/more-count'
import type { NumberedTurn } from '@/features/conversations/transcript-turns'
import { formatCount } from '@/lib/format'

function Section({
    label,
    children,
}: {
    label: string
    children: React.ReactNode
}) {
    return (
        <section aria-label={label} className="flex min-w-0 flex-col gap-2">
            <SectionLabel>{label}</SectionLabel>
            {children}
        </section>
    )
}

type TranscriptSideProps = {
    conversation: Conversation
    /** The loaded turns, which the jump list links to. */
    turns: NumberedTurn[]
    onJump: (traceId: string) => void
}

/**
 * Beside the transcript: who the conversation is with, its figures over all of its turns (the
 * API's, never added up from the turns loaded), the agents that took part, and a list to jump to
 * a loaded turn.
 */
export function TranscriptSide({
    conversation,
    turns,
    onJump,
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
        <div className="flex min-w-0 flex-col gap-6">
            {users.length === 0 && moreUsers === 0 ? null : (
                <Section
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
                                className="flex min-w-0 flex-col"
                            >
                                <UserLabel
                                    user={user}
                                    className="font-medium"
                                />
                                {user.email === null ||
                                user.name === null ? null : (
                                    <span className="text-caption wrap-anywhere text-muted-foreground">
                                        {user.email}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                    <MoreCount count={moreUsers} noun="user" />
                </Section>
            )}
            <Section label="Session summary">
                <KeyValueList layout="rows">
                    <KeyValue label="Recorded turns">
                        {formatCount(counts.all)}
                    </KeyValue>
                    <KeyValue label="Failed turns">
                        {formatCount(counts.failed + counts.incomplete)}
                    </KeyValue>
                    {counts.running === 0 ? null : (
                        <KeyValue label="Running">
                            {formatCount(counts.running)}
                        </KeyValue>
                    )}
                    {counts.awaiting_approval === 0 ? null : (
                        <KeyValue label="Awaiting approval">
                            {formatCount(counts.awaiting_approval)}
                        </KeyValue>
                    )}
                    <KeyValue label="Input tokens">
                        <TokenCount
                            count={usage.input_tokens}
                            pending={pending}
                        />
                    </KeyValue>
                    <KeyValue label="Output tokens">
                        <TokenCount
                            count={usage.output_tokens}
                            pending={pending}
                        />
                    </KeyValue>
                    <KeyValue label="Estimated cost">
                        <CostValue cost={conversation.cost} />
                    </KeyValue>
                    <KeyValue label="Last activity">
                        <Timestamp
                            at={conversation.last_activity_at}
                            layout="inline"
                        />
                    </KeyValue>
                </KeyValueList>
            </Section>
            {conversation.agents.length === 0 && moreAgents === 0 ? null : (
                <Section label="Agents">
                    <ul className="flex flex-col gap-1 font-mono text-xs">
                        {conversation.agents.map((name) => (
                            <li key={name} className="wrap-anywhere">
                                {name}
                            </li>
                        ))}
                    </ul>
                    <MoreCount count={moreAgents} noun="agent" />
                </Section>
            )}
            <JumpToTurn turns={turns} onJump={onJump} />
        </div>
    )
}
