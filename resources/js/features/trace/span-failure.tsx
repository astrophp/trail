import type { Span } from '@/api/types'
import { Notice } from '@/components/patterns/notice'
import { ErrorSummary } from '@/components/telemetry/error-summary'
import { Button } from '@/components/ui/button'
import type { SpanTree } from '@/features/trace/build-span-tree'
import { childAgent } from '@/features/trace/child-agent'

type SpanFailureProps = {
    span: Span
    tree: SpanTree
    onSelect: (id: string) => void
}

/**
 * How the span failed. A tool that started an agent which failed is itself completed (the SDK
 * hands the error back as the tool's result), so it says so and points at the agent, which shows
 * the error itself.
 */
export function SpanFailure({ span, tree, onSelect }: SpanFailureProps) {
    const child = span.type === 'tool' ? childAgent(tree, span) : undefined
    const swallowed =
        span.status === 'completed' && child?.status === 'failed'
            ? child
            : undefined

    return (
        <>
            {span.status === 'failed' ||
            span.error !== null ||
            span.issue_kind !== null ? (
                <ErrorSummary error={span.error} issueKind={span.issue_kind} />
            ) : null}
            {swallowed ? (
                <Notice
                    tone="warning"
                    title="The agent this tool started failed. The tool returned its error as a normal result."
                    action={
                        <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => onSelect(swallowed.id)}
                        >
                            Open the agent that failed
                        </Button>
                    }
                />
            ) : null}
        </>
    )
}
