import type { Usage } from '@/api/types'
import { Metric } from '@/components/patterns/metric'
import { TokenCount } from '@/components/telemetry/token-count'
import { TokenValue } from '@/components/telemetry/token-value'

/**
 * The tokens the runs of the range used: the total, and under it the input and the output as the
 * providers reported them. Cached tokens are a part of the input, never an addition to it, so the
 * line says "of which" and only when a count was reported. While runs are running the counts are
 * what has been recorded so far, and the total says so.
 */
export function TokensMetric({ usage }: { usage: Usage }) {
    const pending = usage.state === 'pending'

    return (
        <Metric
            label="Total tokens"
            detail={
                <>
                    <span>
                        Input{' '}
                        <TokenCount
                            count={usage.input_tokens}
                            pending={pending}
                            pendingAmount="show"
                        />
                        {usage.cache_read_tokens === null ? null : (
                            <>
                                {' '}
                                (of which{' '}
                                <TokenCount
                                    count={usage.cache_read_tokens}
                                    pending={pending}
                                    pendingAmount="show"
                                />{' '}
                                cached)
                            </>
                        )}
                    </span>
                    {' · '}
                    <span>
                        Output{' '}
                        <TokenCount
                            count={usage.output_tokens}
                            pending={pending}
                            pendingAmount="show"
                        />
                    </span>
                </>
            }
        >
            <TokenValue usage={usage} pendingAmount="show" />
        </Metric>
    )
}
