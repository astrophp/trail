import { InfoIcon } from 'lucide-react'
import type { Coverage, Span } from '@/api/types'
import { isAbsent } from '@/lib/payload-access'
import { agentInput } from '@/components/telemetry/payload-shape'
import { PayloadSection } from '@/components/telemetry/payload-section'
import { SystemPrompt } from '@/features/trace/system-prompt'
import { noSystemPromptWords } from '@/features/trace/system-prompt-gap'
import { WholeInput } from '@/components/telemetry/whole-input'

type AgentInputProps = { span: Span; coverage: Coverage }

/** What an agent was asked: its system prompt (closed), the prompt of this turn, and any attachments. */
export function AgentInput({ span, coverage }: AgentInputProps) {
    const shape = agentInput(span.input)

    if (shape.kind === 'none') {
        return null
    }

    if (shape.kind === 'whole') {
        return <WholeInput span={span} />
    }

    const { system, prompt, attachments } = shape.value

    return (
        <div className="flex flex-col gap-6">
            {system !== null && system !== '' ? (
                <SystemPrompt span={span} text={system} />
            ) : (
                <p className="text-ui text-muted-foreground">
                    {noSystemPromptWords(coverage.system_prompt)}
                </p>
            )}
            <div className="flex flex-col gap-3">
                <PayloadSection
                    span={span}
                    path="input.prompt"
                    heading="User prompt · current turn"
                    label="prompt"
                    value={prompt}
                />
                {isAbsent(prompt) ? null : (
                    <p className="flex items-start gap-1.5 text-caption text-muted-foreground">
                        <InfoIcon
                            aria-hidden="true"
                            className="mt-px size-3 shrink-0"
                        />
                        Captured prompt for this turn. This is not a
                        reconstruction of the full model context.
                    </p>
                )}
            </div>
            {isAbsent(attachments) ? null : (
                <PayloadSection
                    span={span}
                    path="input.attachments"
                    heading="Attachments"
                    value={attachments}
                />
            )}
        </div>
    )
}
