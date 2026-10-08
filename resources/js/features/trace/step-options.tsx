import type { Span } from '@/api/types'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import { isContainer, type JsonObject } from '@/lib/json'
import { SectionLabel } from '@/features/trace/section-label'
import { StoredPayload } from '@/features/trace/stored-payload'

type StepOptionsProps = {
    span: Pick<Span, 'truncated_paths'>
    options: JsonObject
}

/**
 * The options a step was sent with: only those that were set. A scalar is written as it is stored;
 * anything with parts (a tool choice, provider options) goes to the payload viewer. Nothing is
 * shown when every option is null.
 */
export function StepOptions({ span, options }: StepOptionsProps) {
    const set = Object.entries(options).filter(([, value]) => value !== null)

    if (set.length === 0) {
        return null
    }

    return (
        <section data-slot="step-options" className="flex flex-col gap-3">
            <SectionLabel>Options</SectionLabel>
            <KeyValueList layout="rows">
                {set.map(([key, value]) => (
                    <KeyValue key={key} label={key}>
                        {isContainer(value) ? (
                            <StoredPayload
                                span={span}
                                path={`input.options.${key}`}
                                label={key}
                                value={value}
                            />
                        ) : (
                            <span className="font-mono">{String(value)}</span>
                        )}
                    </KeyValue>
                ))}
            </KeyValueList>
        </section>
    )
}
