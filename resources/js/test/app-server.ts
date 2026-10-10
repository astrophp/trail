import type { TraceNeighbours } from '@/api/types'
import { agentFixture, listOf as agentsOf } from '@/test/agents-api'
import { mockSearch, otherPages, searchFor } from '@/test/palette-api'
import { makeAgentSpan, makeDetail, makeStepSpan } from '@/test/trace-api'
import { json, type Handler } from '@/test/traces-api'
import { transcriptFixture } from '@/test/transcript-api'
import { breakdownOf, modelRows } from '@/test/usage-api'

type Served = {
    /** The runs next to a run in its list, by run id; a run not named here has none. */
    neighbours?: Record<string, TraceNeighbours>
    /**
     * Holds the answer to a request until the promise it returns for it is settled; the answer is
     * then the same as any other.
     */
    hold?: (url: string) => Promise<void> | undefined
}

const pageOf = (url: string) =>
    Number(new URL(url, 'http://x').searchParams.get('page') ?? 1)

/**
 * A fake of every endpoint the dashboard's pages ask for, as the tests of the shortcuts need them:
 * the lists of runs, conversations, agents and the usage breakdown each have three pages, a run
 * (any id) has a page of its own with the neighbours given, and the one conversation is the
 * contract's transcript. The mock records every request.
 */
export function serveApp({ neighbours = {}, hold }: Served = {}) {
    const answer: Handler = (url, init) => {
        const parts = new URL(url, 'http://x').pathname
            .replace('/trail/api', '')
            .split('/')

        if (parts[1] === 'traces' && parts.length >= 3) {
            const id = decodeURIComponent(parts[2])

            return parts[3] === 'neighbours'
                ? json({
                      data: neighbours[id] ?? { previous: null, next: null },
                  })
                : json(
                      makeDetail({
                          trace: { id, name: `Run ${id}` },
                          spans: [
                              makeAgentSpan('root', { sequence: 1 }),
                              makeStepSpan('s1', {
                                  sequence: 2,
                                  parent_id: 'root',
                                  step_number: 0,
                              }),
                          ],
                      }),
                  )
        }

        if (parts[1] === 'conversations' && parts[2] === 'transcript') {
            return json(transcriptFixture)
        }

        if (parts[1] === 'agents' && parts.length === 2) {
            return json(
                agentsOf(agentFixture.data, { page: pageOf(url), total: 60 }),
            )
        }

        if (parts[1] === 'usage' && parts[2] === 'breakdown') {
            return json(
                breakdownOf('model', modelRows, {
                    page: pageOf(url),
                    total: 60,
                }),
            )
        }

        return otherPages(url, init)
    }

    return mockSearch(
        () => json(searchFor('')),
        (url, init) => {
            const gate = hold?.(url)

            return gate === undefined
                ? answer(url, init)
                : gate.then(() => answer(url, init))
        },
    )
}
