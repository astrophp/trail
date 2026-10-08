import type { Span } from '@/api/types'
import { MessageItem } from '@/components/telemetry/message-item'
import { stepInput } from '@/components/telemetry/payload-shape'
import { PayloadSection } from '@/components/telemetry/payload-section'
import { SectionLabel } from '@/components/telemetry/section-label'
import { StepOptions } from '@/components/telemetry/step-options'
import { WholeInput } from '@/components/telemetry/whole-input'
import { formatCount } from '@/lib/format'

type StepInputProps = { span: Span }

/** What a model step sent: the messages that were new at this step, and the options it used. */
export function StepInput({ span }: StepInputProps) {
    const shape = stepInput(span.input)

    if (shape.kind === 'none') {
        return null
    }

    if (shape.kind === 'whole') {
        return <WholeInput span={span} />
    }

    const { messages, offset, options } = shape.value

    return (
        <div className="flex flex-col gap-6">
            {messages === null ? (
                <PayloadSection
                    span={span}
                    path="input.messages"
                    heading="Messages"
                    value={undefined}
                />
            ) : (
                <section className="flex flex-col gap-3">
                    <SectionLabel>Messages</SectionLabel>
                    {offset > 0 ? (
                        <p className="text-ui text-muted-foreground">
                            {offset === 1
                                ? '1 earlier message was sent with this step. It is stored on a step before it.'
                                : `${formatCount(offset)} earlier messages were sent with this step. They are stored on the steps before it.`}
                        </p>
                    ) : null}
                    {messages.length === 0 ? (
                        offset === 0 ? (
                            <p className="text-ui text-muted-foreground">
                                No messages were stored for this step.
                            </p>
                        ) : null
                    ) : (
                        <ol className="flex flex-col gap-4">
                            {messages.map((message, index) => (
                                <MessageItem
                                    key={index}
                                    span={span}
                                    index={index}
                                    number={offset + index + 1}
                                    message={message}
                                />
                            ))}
                        </ol>
                    )}
                </section>
            )}
            {options === null ? null : (
                <StepOptions span={span} options={options} />
            )}
        </div>
    )
}
