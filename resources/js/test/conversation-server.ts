import { vi } from 'vitest'
import type { Turn } from '@/api/types'
import { metaFixture, json, type Handler } from '@/test/traces-api'
import { makeAgentSpan, makeDetail } from '@/test/trace-api'
import { windowOf } from '@/test/transcript-api'

export const conversationId = 'support/ada 1042'

/** The most turns one answer holds, as the endpoint's `limit` is clamped. */
const mostTurns = 10

/**
 * A fake of the endpoints a conversation's round trip uses: the transcript (windows chosen by
 * `turn`, `before` and `after` exactly as the API's docs say, with the database's counts), a
 * run's page and its neighbours within the conversation. `turns` is the conversation, oldest first,
 * and may be changed between requests; `id` is the spelling of the conversation's id it answers with. Everything is recorded in `calls`.
 */
export function conversationServer(turns: Turn[], id = conversationId) {
    const server = {
        turns,
        /** Each request's URL, in order. */
        calls: [] as string[],
        /** Replaces the answer to the transcript request for which it returns a response. */
        intercept: undefined as
            | undefined
            | ((
                  url: string,
                  params: URLSearchParams,
              ) => Promise<Response> | undefined),
        /** Answers the neighbour requests with a failure. */
        failNeighbours: false,
        /** The transcript requests made so far, as their query. */
        transcript: () =>
            server.calls
                .filter((url) => url.includes('/api/conversations/transcript'))
                .map((url) => new URL(url, 'http://x').searchParams),
        /** The neighbour requests made so far, as `id?query`. */
        neighbours: () =>
            server.calls
                .filter((url) => url.includes('/neighbours'))
                .map((url) => {
                    const parsed = new URL(url, 'http://x')

                    return `${decodeURIComponent(parsed.pathname.split('/').at(-2) ?? '')}${parsed.search}`
                }),
    }

    function windowFor(params: URLSearchParams) {
        const all = server.turns
        const limit = Math.min(
            Math.max(Number(params.get('limit') ?? mostTurns) || mostTurns, 1),
            mostTurns,
        )
        const at = (id: string | null) =>
            all.findIndex((turn) => turn.trace.id === id)
        let start = Math.max(all.length - limit, 0)
        let end = all.length
        let anchor = null as null | {
            param: 'turn' | 'before' | 'after'
            id: string
            found: boolean
        }

        for (const param of ['turn', 'before', 'after'] as const) {
            const id = params.get(param)

            if (id === null) {
                continue
            }

            const index = at(id)

            anchor = { param, id, found: index !== -1 }

            if (index === -1) {
                break
            }

            if (param === 'turn') {
                end = index + 1
                start = Math.max(end - limit, 0)
            } else if (param === 'before') {
                end = index
                start = Math.max(end - limit, 0)
            } else {
                start = index + 1
                end = Math.min(start + limit, all.length)
            }
        }

        const response = windowOf(all.slice(start, end), {
            older: start,
            newer: all.length - end,
            conversation: { id },
        })

        response.window.anchor = anchor

        return response
    }

    const handler: Handler = (url) => {
        server.calls.push(url)

        const parsed = new URL(url, 'http://x')
        const path = parsed.pathname.replace('/trail/api', '')

        if (path === '/meta') {
            return json(metaFixture)
        }

        if (path === '/conversations/transcript') {
            return (
                server.intercept?.(url, parsed.searchParams) ??
                json(windowFor(parsed.searchParams))
            )
        }

        const [, , raw, rest] = path.split('/')
        const id = decodeURIComponent(raw ?? '')
        const index = server.turns.findIndex((turn) => turn.trace.id === id)

        if (rest === 'neighbours') {
            if (server.failNeighbours) {
                return json({ message: 'Unavailable.' }, 500)
            }

            return json({
                data: {
                    previous: server.turns[index - 1]?.trace.id ?? null,
                    next: server.turns[index + 1]?.trace.id ?? null,
                },
            })
        }

        if (path.startsWith('/traces/') && index !== -1) {
            return json(
                makeDetail({
                    trace: { ...server.turns[index].trace },
                    spans: [makeAgentSpan('root', { sequence: 1 })],
                }),
            )
        }

        return json({ message: 'Not found.' }, 404)
    }
    const fetchMock = vi.fn<Handler>(handler)

    vi.stubGlobal('fetch', fetchMock)

    return server
}
