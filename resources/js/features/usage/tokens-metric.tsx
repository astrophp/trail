import type { Usage } from '@/api/types'
import { Metric } from '@/components/patterns/metric'
import { TokenCount } from '@/components/telemetry/token-count'
import { TokenValue } from '@/components/telemetry/token-value'

/**
 * The tokens the runs of the range used: the total, and under it the input and the output as the
 * providers reported them. Cached tokens are a part of the input, never an addition to it, so the
 * line says "of which" and only when a count was reported. While runs are running the total says
 * so, and the parts are left out rather than shown as numbers that can still grow.
 */
export function TokensMetric({ usage }: { usage: Usage }) {
    return (
        <Metric
            label="Total tokens"
            detail={
                usage.state === 'pending' ? undefined : (
                    <>
                        <span>
                            Input <TokenCount count={usage.input_tokens} />
                            {usage.cache_read_tokens === null ? null : (
                                <>
                                    {' '}
                                    (of which{' '}
                                    <TokenCount
                                        count={usage.cache_read_tokens}
                                    />{' '}
                                    cached)
                                </>
                            )}
                        </span>
                        {' · '}
                        <span>
                            Output <TokenCount count={usage.output_tokens} />
                        </span>
                    </>
                )
            }
        >
            <TokenValue usage={usage} />
        </Metric>
    )
}
