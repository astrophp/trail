import type { Span } from '@/api/types'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import type { SpanTree } from '@/features/trace/build-span-tree'
import {
    matchToolCalls,
    type RequestedCall,
} from '@/features/trace/match-tool-calls'
import { asObject, isAbsent } from '@/features/trace/payload-access'
import { stepOutput } from '@/features/trace/payload-shape'
import { PayloadSection } from '@/features/trace/payload-section'
import { SectionLabel } from '@/features/trace/section-label'
import { ToolCallItem } from '@/features/trace/tool-call-item'
import type { RunContext } from '@/features/trace/tool-call-status'
import { WholeOutput } from '@/features/trace/whole-output'

type StepOutputProps = {
    span: Span
    tree: SpanTree
    run: RunContext
    onSelect: (id: string) => void
}

/** The span of each of a step's siblings: the spans that share its parent. */
function siblingsOf(tree: SpanTree, span: Span): Span[] {
    const parent =
        span.parent_id === null ? undefined : tree.byId.get(span.parent_id)

    return (parent ? parent.children : tree.roots).map((node) => node.span)
}

/** What a model step answered: its text, the tool calls it asked for, why it stopped, and any structured output. */
export function StepOutput({ span, tree, run, onSelect }: StepOutputProps) {
    const shape = stepOutput(span.output)

    if (shape.kind === 'none') {
        return null
    }

    if (shape.kind === 'whole') {
        return <WholeOutput span={span} />
    }

    const { text, calls, reason, structured } = shape.value
    const requested: RequestedCall[] = (calls ?? []).map((call) => {
        const object = asObject(call)

        return {
            name: typeof object?.name === 'string' ? object.name : null,
            arguments: object === null ? undefined : object.arguments,
        }
    })
    const ran = matchToolCalls(span, requested, siblingsOf(tree, span))
    const hasText = text !== null && text !== ''
    const hasCalls = calls !== null && calls.length > 0

    return (
        <div className="flex flex-col gap-6">
            {hasText ? (
                <PayloadSection
                    span={span}
                    path="output.text"
                    heading="Text"
                    value={text}
                />
            ) : null}
            {hasCalls ? (
                <section className="flex flex-col gap-4">
                    <SectionLabel>Tool calls</SectionLabel>
                    {calls.map((call, index) => (
                        <ToolCallItem
                            key={index}
                            span={span}
                            tree={tree}
                            run={run}
                            index={index}
                            repeated={
                                requested[index].name !== null &&
                                requested.filter(
                                    (other) =>
                                        other.name === requested[index].name,
                                ).length > 1
                            }
                            call={call}
                            ran={ran[index] ?? null}
                            onSelect={onSelect}
                        />
                    ))}
                </section>
            ) : null}
            {reason !== null ? (
                <KeyValueList>
                    <KeyValue label="Finish reason">
                        <span className="font-mono text-xs">{reason}</span>
                    </KeyValue>
                </KeyValueList>
            ) : null}
            {isAbsent(structured) ? null : (
                <PayloadSection
                    span={span}
                    path="output.structured"
                    heading="Structured output"
                    value={structured}
                />
            )}
        </div>
    )
}
