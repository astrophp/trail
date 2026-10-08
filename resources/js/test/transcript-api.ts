import { vi } from 'vitest'
import type {
    Conversation,
    Message,
    ToolCall,
    Trace,
    TranscriptResponse,
    Turn,
} from '@/api/types'
import { contractFixture } from '@/test/contract-fixture'
import { json, metaFixture, type Handler } from '@/test/traces-api'

export {
    deferred,
    json,
    metaFixture,
    paramsOf,
    type Handler,
} from '@/test/traces-api'

/** The transcript the contract test froze: a turn with tools and a delegation, a failover, a turn waiting for approval. */
export const transcriptFixture = contractFixture(
    'conversation',
) as TranscriptResponse

const base = transcriptFixture.data.turns[0]

/** One message of a turn; a key the stored message does not have is `null`. */
export function message(
    part: Message['part'],
    content: string | null,
    overrides: Partial<Message> = {},
): Message {
    return {
        part,
        role: part === 'prompt' ? 'user' : 'assistant',
        content,
        structured: null,
        attachments: null,
        tool_calls: null,
        tool_results: null,
        source: {
            span_id: `${part}-span`,
            path: 'input.messages.0',
            redacted: false,
            truncated: false,
        },
        truncated_paths: {},
        ...overrides,
    }
}

/** A tool call of a message, linked to a tool span unless said otherwise. */
export function call(
    name: string,
    overrides: Partial<ToolCall> = {},
): ToolCall {
    return {
        id: `call-${name}`,
        name,
        arguments: { q: name },
        link: 'linked',
        span: {
            id: `span-${name}`,
            status: 'completed',
            issue_kind: null,
            duration_ms: 120.5,
        },
        agent: null,
        ...overrides,
    }
}

type TurnOverrides = Partial<Omit<Turn, 'trace'>> & {
    trace?: Partial<Trace>
}

/** A completed turn with a prompt and a response, with some of its parts replaced. */
export function turnOf(id: string, overrides: TurnOverrides = {}): Turn {
    const { trace, ...rest } = overrides

    return {
        ...base,
        trace: {
            ...base.trace,
            id,
            prompt_excerpt: null,
            response_excerpt: null,
            ...trace,
        },
        detail: {
            error: null,
            pending_approvals: [],
            resolved_tool_call_ids: [],
        },
        attempts: [
            {
                attempt: 1,
                provider: 'anthropic',
                model: 'claude-sonnet-4-5',
                span_id: `${id}-s02`,
                error: null,
            },
        ],
        messages: [
            message('prompt', `Question of ${id}`),
            message('response', `Answer of ${id}`),
        ],
        ...rest,
    }
}

/** The answer for a window of turns, oldest first. */
export function windowOf(
    turns: Turn[],
    {
        older = 0,
        newer = 0,
        conversation = {},
    }: {
        older?: number
        newer?: number
        conversation?: Partial<Conversation>
    } = {},
): TranscriptResponse {
    const fixture = transcriptFixture.data.conversation
    const total = older + turns.length + newer

    return {
        data: {
            conversation: {
                ...fixture,
                turns: { ...fixture.turns, all: total },
                ...conversation,
            },
            turns,
        },
        turn_limit: { limit: 10, total, truncated: older + newer > 0 },
        window: { older, newer, anchor: null },
    }
}

/** Answers `/meta` with its fixture and the transcript with `respond`. */
export function mockTranscript(
    respond: Handler = () => json(transcriptFixture),
) {
    const fetchMock = vi.fn<Handler>((url, init) =>
        url.includes('/api/meta') ? json(metaFixture) : respond(url, init),
    )
    vi.stubGlobal('fetch', fetchMock)

    return fetchMock
}

/** The transcript requests made so far. */
export const transcriptUrls = (fetchMock: ReturnType<typeof mockTranscript>) =>
    fetchMock.mock.calls
        .map(([url]) => url)
        .filter((url) => url.includes('/api/conversations/transcript'))

/** The query of a request URL. */
export const queryOf = (url: string | undefined) =>
    new URL(url ?? '', 'http://x').searchParams
