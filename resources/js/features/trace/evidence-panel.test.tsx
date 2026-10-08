import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
    AgentSubtotal,
    Coverage,
    JsonValue,
    PendingApproval,
    Span,
    Trace,
} from '@/api/types'
import { formatCount, formatDateTime, formatOffset } from '@/lib/format'
import { appReady, renderApp } from '@/test/render-app'
import {
    makeAgentSpan,
    makeDetail,
    makeEmbeddingSpan,
    makeStepSpan,
    makeToolSpan,
    mockTraceApi,
} from '@/test/trace-api'

const id = '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30'

beforeEach(() => {
    window.Trail = {
        path: '/trail',
        apiPath: '/trail/api',
        csrfToken: 'csrf-1',
    }
})

afterEach(() => {
    delete window.Trail
    window.innerWidth = 1024
})

type OpenOptions = {
    search?: string
    coverage?: Partial<Coverage>
    trace?: Partial<Trace>
    agents?: AgentSubtotal[]
    pendingApprovals?: PendingApproval[]
    /** Only the evidence is on screen (a narrow screen with a span in the URL): wait for that. */
    evidenceOnly?: boolean
}

/** Opens the run and waits for the tree: only then is there anything to assert about. */
async function open(spans: Span[], options: OpenOptions = {}) {
    mockTraceApi({
        [id]: makeDetail({
            trace: { id, ...options.trace },
            spans,
            agents: options.agents,
            pendingApprovals: options.pendingApprovals,
            coverage: options.coverage,
        }),
    })
    renderApp(`/traces/${id}${options.search ?? ''}`)
    await appReady()
    await (options.evidenceOnly
        ? screen.findByRole('region', { name: 'Span evidence' })
        : screen.findByRole('tree', { name: 'Execution tree' }))
}

const panel = () =>
    within(
        document.querySelector('[data-slot="evidence-panel"]') as HTMLElement,
    )
const spanHeader = () =>
    within(document.querySelector('[data-slot="span-header"]') as HTMLElement)
const tabNames = () =>
    within(screen.getByRole('tablist', { name: 'Evidence' }))
        .getAllByRole('tab')
        .map((tab) => tab.textContent)
const activeTabName = () =>
    within(screen.getByRole('tablist', { name: 'Evidence' }))
        .getAllByRole('tab')
        .find((tab) => tab.getAttribute('aria-selected') === 'true')
        ?.textContent
const selectedRow = () =>
    screen
        .getAllByRole('treeitem')
        .filter((item) => item.getAttribute('aria-selected') === 'true')
        .map((item) => item.getAttribute('aria-label'))
const messageItems = () =>
    Array.from(
        document.querySelectorAll<HTMLElement>('[data-slot="message-item"]'),
    )
const params = () => new URLSearchParams(window.location.search)
const openTab = (name: string) =>
    userEvent.click(
        within(screen.getByRole('tablist', { name: 'Evidence' })).getByRole(
            'tab',
            { name },
        ),
    )
const group = (name: string) => panel().getByRole('group', { name })

function root(overrides: Partial<Span> = {}) {
    return makeAgentSpan('root', { sequence: 1, ...overrides })
}

function step(spanId: string, sequence: number, overrides: Partial<Span> = {}) {
    return makeStepSpan(spanId, {
        sequence,
        parent_id: 'root',
        step_number: 0,
        ...overrides,
    })
}

function tool(spanId: string, sequence: number, overrides: Partial<Span> = {}) {
    return makeToolSpan(spanId, {
        sequence,
        parent_id: 'root',
        ...overrides,
    })
}

describe('the tabs of a span', () => {
    const payloads = (input: JsonValue, output: JsonValue) => ({
        input,
        output,
    })

    it.each([
        ['agent', () => root(payloads({ prompt: 'Hi' }, { text: 'Hello' }))],
        [
            'step',
            () =>
                step(
                    's',
                    2,
                    payloads(
                        {
                            messages: [{ role: 'user', content: 'Hi' }],
                            messages_offset: 0,
                            options: null,
                        },
                        {
                            text: 'Hello',
                            tool_calls: [],
                            finish_reason: 'stop',
                        },
                    ),
                ),
        ],
        [
            'tool',
            () => tool('s', 2, payloads({ arguments: {} }, { result: 'ok' })),
        ],
        [
            'embedding',
            () =>
                makeEmbeddingSpan('s', {
                    sequence: 2,
                    ...payloads({ count: 2, dimensions: null }, { count: 2 }),
                }),
        ],
    ] as const)(
        'offers input, output, metadata and raw for a %s with everything',
        async (type, make) => {
            const span = make()
            await open(type === 'agent' ? [span] : [root(), span], {
                search: type === 'agent' ? '' : '?span=s',
            })

            expect(tabNames()).toEqual(['Input', 'Output', 'Metadata', 'Raw'])
            expect(activeTabName()).toBe('Input')
        },
    )

    it('offers no output tab for a span that has only input', async () => {
        await open([root({ input: { prompt: 'Hi' } })])

        expect(tabNames()).toEqual(['Input', 'Metadata', 'Raw'])
        expect(
            screen.queryByRole('tab', { name: 'Output' }),
        ).not.toBeInTheDocument()
        expect(
            panel().queryByText(/No input or output was stored/),
        ).not.toBeInTheDocument()
    })

    it('offers no input tab for a span that has only output, and starts on output', async () => {
        await open([root({ output: { text: 'Done' } })])

        expect(tabNames()).toEqual(['Output', 'Metadata', 'Raw'])
        expect(activeTabName()).toBe('Output')
        expect(screen.getByText('Done')).toBeVisible()
    })

    it('says once, in words, that a running span has stored nothing yet, and offers metadata and raw', async () => {
        await open([root({ status: 'running', duration_ms: null })])

        expect(tabNames()).toEqual(['Metadata', 'Raw'])
        expect(
            screen.getByText(
                'This span has not finished. Nothing more has been stored yet.',
            ),
        ).toBeInTheDocument()
        expect(panel().getAllByRole('status')).toHaveLength(1)
    })

    it('says payload capture may be off when the run stored no payloads', async () => {
        await open([root()], {
            coverage: {
                payloads: {
                    state: 'not_captured',
                    captured: 0,
                    expected: 1,
                    reason: 'not_stored',
                },
            },
        })

        expect(tabNames()).toEqual(['Metadata', 'Raw'])
        expect(
            screen.getByText(
                'No payloads were stored for this run. Payload capture may be switched off (`trail.capture.enabled`).',
            ),
        ).toBeInTheDocument()
    })

    it('otherwise says nothing was stored for this span', async () => {
        await open([root()])

        expect(tabNames()).toEqual(['Metadata', 'Raw'])
        expect(
            screen.getByText('No input or output was stored for this span.'),
        ).toBeInTheDocument()
    })
})

describe('an agent span', () => {
    const agent = () =>
        root({
            input: {
                system: 'You are a careful support agent.',
                prompt: 'Where is my order?',
                attachments: [{ type: 'image', name: 'receipt.png' }],
            },
            output: {
                text: 'It shipped on Monday.',
                structured: { eta: 'Monday' },
            },
        })

    it('keeps the system prompt closed with its length, and shows the prompt and attachments', async () => {
        await open([agent()])

        const trigger = panel().getByRole('button', { name: /System prompt/ })

        expect(trigger).toHaveAttribute('aria-expanded', 'false')
        expect(trigger).toHaveTextContent(
            `${formatCount('You are a careful support agent.'.length)} chars`,
        )
        expect(
            screen.queryByText('You are a careful support agent.'),
        ).not.toBeInTheDocument()
        expect(
            panel().getByRole('heading', {
                name: 'User prompt · current turn',
            }),
        ).toBeInTheDocument()
        expect(screen.getByText('Where is my order?')).toBeVisible()
        expect(
            panel().getByRole('heading', { name: 'Attachments' }),
        ).toBeInTheDocument()

        await userEvent.click(trigger)

        expect(trigger).toHaveAttribute('aria-expanded', 'true')
        expect(
            screen.getByText('You are a careful support agent.'),
        ).toBeVisible()
    })

    it('shows the length of the system prompt in a small tag, singular for one character', async () => {
        await open([root({ input: { system: 'x', prompt: 'Hi' } })])

        expect(
            panel().getByRole('button', { name: /System prompt/ }),
        ).toHaveTextContent('1 char')
        expect(
            panel().getByRole('button', { name: /System prompt/ }),
        ).not.toHaveTextContent('1 chars')
    })

    it('says the prompt is the captured one for this turn, and not the full model context', async () => {
        await open([agent()])

        expect(
            panel().getByText(
                'Captured prompt for this turn. This is not a reconstruction of the full model context.',
            ),
        ).toBeInTheDocument()
    })

    it('leaves that note out when the agent has no prompt', async () => {
        await open([root({ input: { system: 'S', prompt: null } })])

        expect(
            panel().queryByText(
                /not a reconstruction of the full model context/,
            ),
        ).not.toBeInTheDocument()
    })

    it('leaves out the system prompt when it was not captured, and attachments when there are none', async () => {
        await open([
            root({
                input: { prompt: 'Hi', system: null },
                output: { text: 'Yo' },
            }),
        ])

        expect(
            panel().queryByRole('button', { name: /System prompt/ }),
        ).not.toBeInTheDocument()
        expect(
            panel().queryByRole('heading', { name: 'Attachments' }),
        ).not.toBeInTheDocument()
        expect(
            panel().getByRole('heading', {
                name: 'User prompt · current turn',
            }),
        ).toBeInTheDocument()
    })

    it('shows the response and the structured output on the output tab', async () => {
        await open([agent()])
        await openTab('Output')

        expect(
            panel().getByRole('heading', { name: 'Response' }),
        ).toBeInTheDocument()
        expect(screen.getByText('It shipped on Monday.')).toBeVisible()
        expect(
            panel().getByRole('heading', { name: 'Structured output' }),
        ).toBeInTheDocument()
        expect(group('structured output')).toBeInTheDocument()
    })

    it('shows an input of an unexpected shape as stored', async () => {
        await open([root({ input: { prompt: 42, system: ['x'] } })])

        expect(group('input')).toBeInTheDocument()
        expect(
            panel().queryByRole('heading', {
                name: 'User prompt · current turn',
            }),
        ).not.toBeInTheDocument()
    })
})

describe('a model step', () => {
    const messages: JsonValue[] = [
        { role: 'user', content: 'Where is my order?' },
        {
            role: 'assistant',
            content: '',
            tool_calls: [
                {
                    id: 'c1',
                    name: 'search',
                    arguments: { query: 'order 1042' },
                },
            ],
        },
        {
            role: 'tool_result',
            content: null,
            tool_results: [
                { id: 'c1', name: 'search', result: 'Order 1042 shipped.' },
            ],
        },
        { role: 'developer', content: 'Answer briefly.' },
    ]

    const withInput = (input: JsonValue) => [
        root(),
        step('s1', 2, { input, output: { text: 'ok' } }),
    ]

    it('lists the messages in order with their roles, and the tool calls and results inside them', async () => {
        await open(withInput({ messages, messages_offset: 0, options: null }), {
            search: '?span=s1',
        })

        const items = messageItems()

        expect(items).toHaveLength(4)
        expect(
            items.map(
                (item) =>
                    item.querySelector('[data-slot="badge"]')?.textContent,
            ),
        ).toEqual(['user', 'assistant', 'tool_result', 'developer'])
        expect(within(items[0]).getByText('Where is my order?')).toBeVisible()
        // An empty assistant text is not shown; its tool call is.
        expect(within(items[1]).getByText('search')).toBeInTheDocument()
        expect(
            within(items[1]).getByRole('group', {
                name: 'message 2 search arguments',
            }),
        ).toBeInTheDocument()
        expect(within(items[2]).getByText('Tool results')).toBeInTheDocument()
        expect(within(items[2]).getByText('Order 1042 shipped.')).toBeVisible()
        expect(within(items[3]).getByText('Answer briefly.')).toBeVisible()
    })

    it('says how many earlier messages were sent, in the singular and the plural', async () => {
        await open(
            withInput({
                messages: [{ role: 'user', content: 'Hi' }],
                messages_offset: 3,
                options: null,
            }),
            { search: '?span=s1' },
        )

        expect(
            screen.getByText(
                `${formatCount(3)} earlier messages were sent with this step. They are stored on the steps before it.`,
            ),
        ).toBeInTheDocument()
    })

    it('uses the singular for one earlier message', async () => {
        await open(
            withInput({
                messages: [{ role: 'user', content: 'Hi' }],
                messages_offset: 1,
                options: null,
            }),
            { search: '?span=s1' },
        )

        expect(
            screen.getByText(
                '1 earlier message was sent with this step. It is stored on a step before it.',
            ),
        ).toBeInTheDocument()
    })

    it('shows no sentence when the stored messages are the whole history', async () => {
        await open(withInput({ messages, messages_offset: 0, options: null }), {
            search: '?span=s1',
        })

        expect(screen.queryByText(/earlier message/)).not.toBeInTheDocument()
    })

    it('lists the options that are set and leaves out those that are null', async () => {
        await open(
            withInput({
                messages: [],
                messages_offset: 0,
                options: {
                    max_steps: 5,
                    max_tokens: null,
                    temperature: 0.7,
                    tool_choice: { mode: 'auto', tool: null },
                },
            }),
            { search: '?span=s1' },
        )

        expect(
            panel().getByRole('heading', { name: 'Options' }),
        ).toBeInTheDocument()
        expect(panel().getByText('max_steps')).toBeInTheDocument()
        expect(panel().getByText('5')).toBeInTheDocument()
        expect(panel().getByText('0.7')).toBeInTheDocument()
        expect(group('tool_choice')).toBeInTheDocument()
        expect(panel().queryByText('max_tokens')).not.toBeInTheDocument()
    })

    it('leaves out the options section when every option is null', async () => {
        await open(
            withInput({
                messages: [{ role: 'user', content: 'Hi' }],
                messages_offset: 0,
                options: { max_steps: null, max_tokens: null },
            }),
            { search: '?span=s1' },
        )

        expect(
            panel().queryByRole('heading', { name: 'Options' }),
        ).not.toBeInTheDocument()
    })

    it('says Not captured for the messages of a step recorded without them, when it has options', async () => {
        await open(withInput({ messages: null, options: { max_steps: 3 } }), {
            search: '?span=s1',
        })

        expect(panel().getByText('Not captured')).toBeInTheDocument()
        expect(panel().getByText('max_steps')).toBeInTheDocument()
    })

    it('offers no input tab for a step with no messages and no options set', async () => {
        await open(
            [
                root(),
                step('s1', 2, {
                    input: { messages: null, options: null },
                    output: { text: 'ok' },
                }),
            ],
            { search: '?span=s1' },
        )

        expect(tabNames()).toEqual(['Output', 'Metadata', 'Raw'])
    })

    it('shows the text, the finish reason and structured output of a step', async () => {
        await open(
            [
                root(),
                step('s1', 2, {
                    input: { messages: [], messages_offset: 0, options: null },
                    output: {
                        text: 'The answer',
                        tool_calls: [],
                        finish_reason: 'stop',
                        structured: { ok: true },
                    },
                }),
            ],
            { search: '?span=s1&tab=output' },
        )

        expect(
            panel().getByRole('heading', { name: 'Text' }),
        ).toBeInTheDocument()
        expect(screen.getByText('The answer')).toBeVisible()
        expect(panel().getByText('Finish reason')).toBeInTheDocument()
        expect(panel().getByText('stop')).toBeInTheDocument()
        expect(
            panel().getByRole('heading', { name: 'Structured output' }),
        ).toBeInTheDocument()
        expect(
            panel().queryByRole('heading', { name: 'Tool calls' }),
        ).not.toBeInTheDocument()
    })
})

describe('a tool span and an embedding span', () => {
    it('shows the arguments and the result of a tool', async () => {
        await open(
            [
                root(),
                tool('t', 2, {
                    input: { arguments: { query: 'order 1042' } },
                    output: { result: 'Order 1042 shipped on Monday.' },
                }),
            ],
            { search: '?span=t' },
        )

        expect(
            panel().getByRole('heading', { name: 'Arguments' }),
        ).toBeInTheDocument()
        expect(group('arguments')).toBeInTheDocument()

        await openTab('Output')

        expect(
            panel().getByRole('heading', { name: 'Result' }),
        ).toBeInTheDocument()
        expect(screen.getByText('Order 1042 shipped on Monday.')).toBeVisible()
    })

    it('does not say the prompt note on a tool or a step', async () => {
        await open(
            [
                root(),
                tool('t', 2, { input: { arguments: { query: 'x' } } }),
                step('s', 3, {
                    input: { messages: [], messages_offset: 0, options: null },
                }),
            ],
            { search: '?span=t' },
        )

        expect(
            screen.queryByText(
                /not a reconstruction of the full model context/,
            ),
        ).not.toBeInTheDocument()

        await userEvent.click(
            screen.getByRole('treeitem', { name: 'Model step 1, Completed' }),
        )

        expect(
            screen.queryByText(
                /not a reconstruction of the full model context/,
            ),
        ).not.toBeInTheDocument()
    })

    it('shows the counts of an embedding, says the texts are not stored, and names the model default', async () => {
        await open(
            [
                makeEmbeddingSpan('e', {
                    sequence: 1,
                    input: { count: 1536, dimensions: null },
                    output: { count: 2 },
                }),
            ],
            {},
        )

        expect(panel().getByText('Inputs')).toBeInTheDocument()
        expect(panel().getByText(formatCount(1536))).toBeInTheDocument()
        expect(panel().getByText('Dimensions')).toBeInTheDocument()
        expect(panel().getByText('Model default')).toBeInTheDocument()
        expect(
            panel().getByText('The embedded texts are not stored.'),
        ).toBeInTheDocument()

        await openTab('Output')

        expect(panel().getByText('Embeddings')).toBeInTheDocument()
        expect(panel().getByText('2')).toBeInTheDocument()
    })

    it('shows the dimensions of an embedding when they were asked for', async () => {
        await open(
            [
                makeEmbeddingSpan('e', {
                    sequence: 1,
                    input: { count: 2, dimensions: 1536 },
                }),
            ],
            {},
        )

        expect(panel().getByText(formatCount(1536))).toBeInTheDocument()
        expect(panel().queryByText('Model default')).not.toBeInTheDocument()
    })
})

describe('the selected tab', () => {
    const spans = () => [
        root({ input: { prompt: 'Hi' }, output: { text: 'Hello' } }),
        step('s1', 2, {
            input: { messages: [], messages_offset: 0, options: null },
            output: { text: 'Hey' },
        }),
        tool('t1', 3, { input: { arguments: {} } }),
    ]

    it('is written to the URL when a tab is picked, without a history entry', async () => {
        await open(spans())
        const entries = window.history.length

        await openTab('Output')

        expect(params().get('tab')).toBe('output')
        expect(window.history.length).toBe(entries)
        expect(activeTabName()).toBe('Output')

        await openTab('Input')

        expect(params().get('tab')).toBe('input')
        expect(activeTabName()).toBe('Input')
    })

    it('is read from the URL', async () => {
        await open(spans(), { search: '?tab=raw' })

        expect(activeTabName()).toBe('Raw')
        expect(group('span')).toBeInTheDocument()
    })

    it('shows the first tab when the URL names one the span does not have, without an error', async () => {
        await open(spans(), { search: '?span=t1&tab=output' })

        expect(tabNames()).toEqual(['Input', 'Metadata', 'Raw'])
        expect(activeTabName()).toBe('Input')
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(params().get('tab')).toBe('output')
    })

    it('ignores a tab that is not one of the four', async () => {
        await open(spans(), { search: '?tab=nope' })

        expect(activeTabName()).toBe('Input')
    })

    it('stays when another span has it, and falls back to the first tab when it does not', async () => {
        await open(spans(), { search: '?tab=output' })
        expect(activeTabName()).toBe('Output')

        await userEvent.click(
            screen.getByRole('treeitem', { name: 'Model step 1, Completed' }),
        )

        expect(params().get('span')).toBe('s1')
        expect(activeTabName()).toBe('Output')

        // The tool has no output: its first tab shows, and the URL still says what the person picked.
        await userEvent.click(
            screen.getByRole('treeitem', { name: 'search, Completed' }),
        )

        expect(activeTabName()).toBe('Input')
        expect(params().get('tab')).toBe('output')

        await userEvent.click(
            screen.getByRole('treeitem', { name: 'Model step 1, Completed' }),
        )

        expect(activeTabName()).toBe('Output')
    })
})

describe('the ancestors of a span', () => {
    const nested = () => [
        makeAgentSpan('a1', { sequence: 1, name: 'Triage' }),
        makeToolSpan('t1', { sequence: 2, parent_id: 'a1', name: 'ask' }),
        makeAgentSpan('a2', { sequence: 3, parent_id: 't1', name: 'Research' }),
        makeStepSpan('s1', {
            sequence: 4,
            parent_id: 'a2',
            step_number: 0,
        }),
    ]

    const crumbs = () =>
        within(screen.getByRole('navigation', { name: 'Span ancestors' }))

    it('lists them root first, and selects the one that is pressed', async () => {
        await open(nested(), { search: '?span=s1' })

        expect(
            crumbs()
                .getAllByRole('button')
                .map((button) => button.textContent),
        ).toEqual(['Triage', 'ask', 'Research'])

        await userEvent.click(crumbs().getByRole('button', { name: 'ask' }))

        expect(params().get('span')).toBe('t1')
        expect(selectedRow()).toEqual(['ask, Completed'])
        expect(
            panel().getByRole('heading', { level: 2, name: 'ask' }),
        ).toBeInTheDocument()
        expect(
            crumbs()
                .getAllByRole('button')
                .map((button) => button.textContent),
        ).toEqual(['Triage'])
    })

    it('is not shown for the root span', async () => {
        await open(nested())

        expect(selectedRow()).toEqual(['Triage, Completed'])
        expect(
            screen.queryByRole('navigation', { name: 'Span ancestors' }),
        ).not.toBeInTheDocument()
    })
})

describe('the link from a step to the tools it ran', () => {
    const calls = (...names: string[]): JsonValue => ({
        text: '',
        tool_calls: names.map((name, i) => ({
            id: `c${i}`,
            name,
            arguments: { n: i },
        })),
        finish_reason: 'tool_use',
    })

    it('selects the tool span of each call, pairing two calls of one tool in order', async () => {
        await open(
            [
                root(),
                step('s0', 2, { output: calls('search', 'search') }),
                tool('first', 3, { name: 'search' }),
                tool('second', 4, { name: 'search' }),
                step('s1', 5, { step_number: 1 }),
            ],
            { search: '?span=s0' },
        )

        const buttons = panel().getAllByRole('button', {
            name: /^Open tool span/,
        })

        expect(buttons).toHaveLength(2)

        await userEvent.click(buttons[1])

        expect(params().get('span')).toBe('second')
        expect(selectedRow()).toEqual(['search, Completed'])
    })

    it('says that no tool span was recorded for a call without one', async () => {
        await open(
            [
                root(),
                step('s0', 2, { output: calls('search', 'refund') }),
                tool('only', 3, { name: 'search' }),
            ],
            { search: '?span=s0' },
        )

        expect(
            panel().getAllByRole('button', { name: 'Open tool span search' }),
        ).toHaveLength(1)
        expect(
            panel().getAllByText('No tool span was recorded for this call'),
        ).toHaveLength(1)
    })

    it('keeps the attempts of a failover apart when both called the same tool', async () => {
        await open(
            [
                root(),
                step('a1s0', 2, { attempt: 1, output: calls('search') }),
                tool('a1t', 3, { attempt: 1, name: 'search' }),
                step('a2s0', 4, { attempt: 2, output: calls('search') }),
                tool('a2t', 5, { attempt: 2, name: 'search' }),
            ],
            { search: '?span=a2s0' },
        )

        await userEvent.click(
            panel().getByRole('button', { name: 'Open tool span search' }),
        )

        expect(params().get('span')).toBe('a2t')
    })
})

describe('the link from a tool to the agent it started', () => {
    const delegated = (childStatus: Span['status'] = 'completed') => [
        root(),
        tool('t1', 2, { name: 'ask', input: { arguments: {} } }),
        makeAgentSpan('a2', {
            sequence: 3,
            parent_id: 't1',
            name: 'Research',
            status: childStatus,
            ...(childStatus === 'failed'
                ? {
                      issue_kind: 'exception' as const,
                      error: {
                          class: 'RuntimeException',
                          message: 'The sub-agent broke',
                          source: 'run' as const,
                          http_status: null,
                      },
                  }
                : {}),
        }),
    ]

    it('selects the first agent under the tool', async () => {
        await open(delegated(), { search: '?span=t1' })

        await userEvent.click(
            panel().getByRole('button', { name: 'Open the agent it started' }),
        )

        expect(params().get('span')).toBe('a2')
        expect(selectedRow()).toEqual(['Research, Completed'])
        expect(
            panel().queryByRole('button', {
                name: 'Open the agent it started',
            }),
        ).not.toBeInTheDocument()
    })

    it('is not shown for a tool that started nothing', async () => {
        await open([root(), tool('t1', 2, { input: { arguments: {} } })], {
            search: '?span=t1',
        })

        expect(
            panel().queryByRole('button', {
                name: 'Open the agent it started',
            }),
        ).not.toBeInTheDocument()
    })

    it('shows a failure the SDK swallowed on the tool, and the error itself on the agent', async () => {
        await open(delegated('failed'), { search: '?span=t1' })

        expect(
            panel().getByText(
                'The agent this tool started failed. The tool returned its error as a normal result.',
            ),
        ).toBeInTheDocument()
        expect(
            panel().queryByRole('group', { name: 'Error' }),
        ).not.toBeInTheDocument()

        await userEvent.click(
            panel().getByRole('button', { name: 'Open the agent that failed' }),
        )

        expect(params().get('span')).toBe('a2')
        expect(group('Error')).toHaveTextContent('The sub-agent broke')
        expect(group('Error')).toHaveTextContent('Exception')
        expect(
            panel().queryByText(/The agent this tool started failed/),
        ).not.toBeInTheDocument()
    })

    it('shows no such notice when the agent completed', async () => {
        await open(delegated(), { search: '?span=t1' })

        expect(
            panel().queryByText(/The agent this tool started failed/),
        ).not.toBeInTheDocument()
    })
})

describe('a failed span', () => {
    it('shows its error at the top of the panel', async () => {
        await open(
            [
                root(),
                step('s1', 2, {
                    status: 'failed',
                    issue_kind: 'rate_limited',
                    error: {
                        class: 'RateLimitedException',
                        message: 'Slow down',
                        source: 'step',
                        http_status: 429,
                    },
                    input: { messages: [], messages_offset: 0, options: null },
                }),
            ],
            { search: '?span=s1' },
        )

        const error = group('Error')

        expect(error).toHaveTextContent('Rate limited')
        expect(error).toHaveTextContent('RateLimitedException')
        expect(error).toHaveTextContent('HTTP 429')
        expect(error).toHaveTextContent('Slow down')
        // It comes before the tabs.
        expect(
            error.compareDocumentPosition(
                screen.getByRole('tablist', { name: 'Evidence' }),
            ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy()
    })

    it('shows no error block for a span that completed', async () => {
        await open([root()])

        expect(
            panel().queryByRole('group', { name: 'Error' }),
        ).not.toBeInTheDocument()
    })
})

describe('redacted and truncated spans', () => {
    it('says once that parts were redacted, and marks the marker in the text', async () => {
        await open([
            root({
                redacted: true,
                input: { prompt: 'My card is [redacted] ok' },
            }),
        ])

        expect(
            screen.getAllByText(
                'Parts of this span were redacted before it was stored.',
            ),
        ).toHaveLength(1)
        expect(
            document.querySelector('[data-slot="redaction"]'),
        ).toHaveTextContent('[redacted]')
    })

    it('shows no redaction notice for a span that was not redacted', async () => {
        await open([root({ input: { prompt: 'Hi' } })])

        expect(screen.queryByText(/were redacted/)).not.toBeInTheDocument()
    })

    it('marks the cut value with its original length when the span names the path', async () => {
        await open([
            root({
                input: { prompt: 'Short start' },
                truncated: true,
                truncated_paths: { 'input.prompt': 12000 },
            }),
        ])

        expect(
            screen.getByText('This value was cut short when it was stored.'),
        ).toBeInTheDocument()
        expect(
            screen.getByText(`It was ${formatCount(12000)} characters.`),
        ).toBeInTheDocument()
        expect(
            screen.queryByText(
                'Part of this span was cut short when it was stored.',
            ),
        ).not.toBeInTheDocument()
    })

    it('marks the cut value without a length when only a path inside it is named', async () => {
        await open(
            [
                root(),
                step('s1', 2, {
                    input: {
                        messages: [{ role: 'user', content: 'Short start' }],
                        messages_offset: 0,
                        options: null,
                    },
                    truncated: true,
                    truncated_paths: { 'input.messages.0.content': 90 },
                }),
            ],
            { search: '?span=s1' },
        )

        const message = within(messageItems()[0])

        expect(
            message.getByText('This value was cut short when it was stored.'),
        ).toBeInTheDocument()
        expect(message.getByText('It was 90 characters.')).toBeInTheDocument()
    })

    it('marks only the values the paths name', async () => {
        await open([
            root({
                input: { prompt: 'Short start', attachments: [{ n: 1 }] },
                truncated: true,
                truncated_paths: { 'input.prompt': 500 },
            }),
        ])

        expect(
            screen.getAllByText('This value was cut short when it was stored.'),
        ).toHaveLength(1)
    })

    it('says once that part of the span was cut short when no viewer on the tab shows it', async () => {
        await open([
            root({
                input: { prompt: 'Hi' },
                output: { text: 'Hello' },
                truncated: true,
                truncated_paths: { 'output.text': 5000 },
            }),
        ])

        // The cut part is on the output tab: this one is told that something is missing.
        expect(
            screen.getAllByText(
                'Part of this span was cut short when it was stored.',
            ),
        ).toHaveLength(1)

        await openTab('Output')

        expect(
            screen.queryByText(
                'Part of this span was cut short when it was stored.',
            ),
        ).not.toBeInTheDocument()
        expect(
            screen.getByText('This value was cut short when it was stored.'),
        ).toBeInTheDocument()
    })

    it('says so for a truncated span that names no path', async () => {
        await open([root({ input: { prompt: 'Hi' }, truncated: true })])

        expect(
            screen.getByText(
                'Part of this span was cut short when it was stored.',
            ),
        ).toBeInTheDocument()
    })
})

describe('the tab bar', () => {
    it('is an underlined row, not a segmented control', async () => {
        await open([root({ input: { prompt: 'Hi' }, output: { text: 'Yo' } })])

        expect(
            screen.getByRole('tablist', { name: 'Evidence' }),
        ).toHaveAttribute('data-variant', 'line')
    })

    it('shows the panel of the tab that was clicked, as the URL says so', async () => {
        await open([root({ input: { prompt: 'Hi' }, output: { text: 'Yo' } })])

        await openTab('Output')

        expect(params().get('tab')).toBe('output')
        expect(activeTabName()).toBe('Output')
        expect(screen.getByText('Yo')).toBeVisible()
        expect(screen.queryByText('Hi')).not.toBeInTheDocument()
    })
})

describe('the head of a span', () => {
    const pendingUsage = {
        state: 'pending',
        input_tokens: null,
        output_tokens: null,
        cache_read_tokens: null,
        cache_write_tokens: null,
        reasoning_tokens: null,
        total_tokens: null,
    } as const
    const header = () => document.querySelector('[data-slot="span-header"]')!
    const metaRow = () => header().querySelector('p + div') as HTMLElement

    it('names an agent, its kind and model, with the duration, start, own tokens and own cost in one row', async () => {
        await open(
            [root({ model: 'gpt-x', duration_ms: 2500, offset_ms: 0 })],
            {
                agents: [
                    {
                        span_id: 'root',
                        name: 'SupportAssistant',
                        usage: {
                            ...pendingUsage,
                            state: 'reported',
                            total_tokens: 1500,
                        },
                        cost: { state: 'estimated', amount: 0.0123 },
                    },
                ],
            },
        )

        expect(
            spanHeader().getByRole('heading', { level: 2 }),
        ).toHaveTextContent('SupportAssistant')
        expect(header().querySelector('p')).toHaveTextContent(
            'Agent run · gpt-x',
        )
        expect(within(metaRow()).getByText('2.50s')).toBeInTheDocument()
        expect(within(metaRow()).getByText('Started +0 ms')).toBeInTheDocument()
        expect(within(metaRow()).getByText('1.5k')).toBeInTheDocument()
        expect(within(metaRow()).getByText('own tokens')).toBeInTheDocument()
        expect(within(metaRow()).getByText('$0.0123')).toBeInTheDocument()
        expect(within(metaRow()).getByText('own cost')).toBeInTheDocument()
        expect(spanHeader().getByText('Completed')).toBeInTheDocument()
    })

    it('reads in progress and pending for a span that is still running', async () => {
        await open(
            [
                root({
                    status: 'running',
                    duration_ms: null,
                    ended_at: null,
                    model: 'gpt-x',
                }),
            ],
            {
                trace: { status: 'running' },
                agents: [
                    {
                        span_id: 'root',
                        name: 'SupportAssistant',
                        usage: pendingUsage,
                        cost: { state: 'pending', amount: null },
                    },
                ],
            },
        )

        expect(within(metaRow()).getByText('In progress')).toBeInTheDocument()
        expect(metaRow()).toHaveTextContent(/Pending\s*own tokens/)
        expect(metaRow()).toHaveTextContent(/Pending\s*own cost/)
        expect(spanHeader().getByText('Running')).toBeInTheDocument()
    })

    it('says model step and the model for a step, with plain tokens and cost', async () => {
        await open([root(), step('s1', 2, { model: 'gpt-x' })], {
            search: '?span=s1',
        })

        expect(header().querySelector('p')).toHaveTextContent(
            'Model step · gpt-x',
        )
        expect(within(metaRow()).getByText('tokens')).toBeInTheDocument()
        expect(within(metaRow()).getByText('cost')).toBeInTheDocument()
        expect(
            within(metaRow()).getByText('Started', { exact: false }),
        ).toBeInTheDocument()
    })

    it('says tool call, with no model and no tokens or cost, for a tool', async () => {
        await open([root(), tool('t1', 2, { offset_ms: 31 })], {
            search: '?span=t1',
        })

        expect(header().querySelector('p')?.textContent).toBe('Tool call')
        expect(
            within(metaRow()).getByText('Started +31 ms'),
        ).toBeInTheDocument()
        expect(within(metaRow()).queryByText('tokens')).not.toBeInTheDocument()
        expect(within(metaRow()).queryByText('cost')).not.toBeInTheDocument()
    })

    it('says embedding and the model for an embedding', async () => {
        await open([makeEmbeddingSpan('e', { sequence: 1 })])

        expect(header().querySelector('p')).toHaveTextContent(
            'Embedding · text-embedding-3-small',
        )
    })

    it('puts the responding-model note and the attempt in the same row', async () => {
        await open(
            [
                root(),
                step('s1', 2, {
                    model: 'a',
                    responding_model: 'a-2025',
                    attempt: 2,
                }),
                step('s2', 3, { attempt: 1 }),
            ],
            { search: '?span=s1' },
        )

        expect(within(metaRow()).getByText(/^Responded as/)).toBeInTheDocument()
        expect(
            within(metaRow()).getByText('Attempt 2 of 2'),
        ).toBeInTheDocument()
    })

    it('has the status at the far end of the title row, not in a pill', async () => {
        await open([root({ status: 'failed' })])

        const status = spanHeader().getByText('Failed')

        expect(status.closest('[data-slot="status-badge"]')).not.toHaveClass(
            'rounded-full',
        )
        expect(status.closest('div')).toContainElement(
            spanHeader().getByRole('heading', { level: 2 }),
        )
    })
})

describe('the model of a span', () => {
    it('shows the responding model when it differs from the requested one', async () => {
        await open(
            [
                root(),
                step('s1', 2, {
                    model: 'claude-sonnet-4-5',
                    responding_model: 'claude-sonnet-4-5-20250929',
                }),
            ],
            { search: '?span=s1' },
        )

        expect(spanHeader().getByText('claude-sonnet-4-5')).toBeInTheDocument()
        expect(
            spanHeader().getByText('claude-sonnet-4-5-20250929'),
        ).toBeInTheDocument()
        expect(spanHeader().getByText(/^Responded as/)).toBeInTheDocument()
    })

    it('shows one model when the responding model is the requested one', async () => {
        await open(
            [
                root(),
                step('s1', 2, { model: 'gpt-x', responding_model: 'gpt-x' }),
            ],
            { search: '?span=s1' },
        )

        expect(spanHeader().getAllByText('gpt-x')).toHaveLength(1)
        expect(spanHeader().queryByText(/Responded as/)).not.toBeInTheDocument()
        expect(
            spanHeader().queryByText('Responding model not captured'),
        ).not.toBeInTheDocument()
    })

    it('says the responding model was not captured for a completed step without one', async () => {
        await open(
            [root(), step('s1', 2, { model: 'gpt-x', responding_model: null })],
            { search: '?span=s1' },
        )

        expect(
            spanHeader().getByText('Responding model not captured'),
        ).toBeInTheDocument()
    })

    it('does not say that for a step that did not complete', async () => {
        await open(
            [
                root(),
                step('s1', 2, {
                    model: 'gpt-x',
                    responding_model: null,
                    status: 'failed',
                }),
            ],
            { search: '?span=s1' },
        )

        expect(
            spanHeader().queryByText('Responding model not captured'),
        ).not.toBeInTheDocument()
    })

    it('shows no model for a tool', async () => {
        await open([root(), tool('t1', 2)], { search: '?span=t1' })

        expect(spanHeader().queryByText('Model')).not.toBeInTheDocument()
    })
})

describe('the metadata and raw tabs', () => {
    const details = () => [
        root(),
        step('s1', 2, {
            step_number: 0,
            attempt: 1,
            sequence: 2,
            offset_ms: 31,
            duration_ms: 840.25,
            started_at: '2026-01-02T11:00:00.100Z',
            ended_at: '2026-01-02T11:00:03.940Z',
            usage: {
                state: 'reported',
                input_tokens: 1200,
                output_tokens: 310,
                cache_read_tokens: 800,
                cache_write_tokens: null,
                reasoning_tokens: 90,
                total_tokens: 1510,
            },
            cost: { state: 'estimated', amount: 0.00825 },
            input: { messages: [], messages_offset: 0, options: null },
            metadata: { region: 'eu' },
        }),
    ]

    it('lists the ids with a copy button, the ordering and the times', async () => {
        await open(details(), { search: '?span=s1&tab=metadata' })

        for (const label of ['Span id', 'Parent span id']) {
            expect(
                panel().getByRole('button', { name: `Copy ${label}` }),
            ).toBeInTheDocument()
        }

        const value = (label: string) =>
            (panel().getByText(label).closest('div') as HTMLElement).textContent

        expect(value('Step index')).toContain('0')
        expect(value('Sequence')).toContain('2')
        expect(value('Offset')).toContain(formatOffset(31))
        expect(value('Type')).toContain('Model step')
        expect(
            panel().getByText(
                formatDateTime(new Date('2026-01-02T11:00:00.100Z'), 'UTC'),
            ),
        ).toBeInTheDocument()
        expect(
            panel().getByText(
                formatDateTime(new Date('2026-01-02T11:00:03.940Z'), 'UTC'),
            ),
        ).toBeInTheDocument()
        expect(
            panel().getByRole('heading', { name: 'Stored metadata' }),
        ).toBeInTheDocument()
        expect(group('stored metadata')).toBeInTheDocument()
    })

    it('shows the token rows of a step with the API numbers, in the same table', async () => {
        await open(details(), { search: '?span=s1&tab=metadata' })

        const list = panel()

        expect(
            list.getByText('Input tokens', { selector: 'dt' })
                .nextElementSibling,
        ).toHaveTextContent(formatCount(1200))
        expect(list.getByText('Cache read')).toBeInTheDocument()
        expect(list.getAllByText('Not reported').length).toBeGreaterThan(0)
        expect(
            list.getByText('Total tokens', { selector: 'dt' })
                .nextElementSibling,
        ).toHaveTextContent(formatCount(1510))
    })

    it('leaves out the parent of the root, and labels the tokens of an agent as its own', async () => {
        await open([root()], { search: '?tab=metadata' })

        expect(panel().queryByText('Parent span id')).not.toBeInTheDocument()
        expect(
            panel().queryByRole('button', { name: 'Copy Parent span id' }),
        ).not.toBeInTheDocument()
        expect(panel().getByText('Own input tokens')).toBeInTheDocument()
        expect(panel().getByText('Own cost')).toBeInTheDocument()
    })

    it('shows no token rows and no model for a tool', async () => {
        await open([root(), tool('t1', 2, { input: { arguments: {} } })], {
            search: '?span=t1&tab=metadata',
        })

        expect(panel().getByText('Parent span id')).toBeInTheDocument()
        expect(panel().queryByText(/tokens/)).not.toBeInTheDocument()
        expect(panel().queryByText('Requested model')).not.toBeInTheDocument()
        expect(panel().queryByText('Not applicable')).not.toBeInTheDocument()
    })

    it('shows the whole span in the raw tab', async () => {
        await open(details(), { search: '?span=s1&tab=raw' })

        expect(group('span')).toBeInTheDocument()
        expect(
            panel().getByRole('button', { name: 'Copy span' }),
        ).toBeInTheDocument()
    })
})

describe('narrow screens', () => {
    beforeEach(() => {
        window.innerWidth = 500
    })

    const spans = () => [
        root({ input: { prompt: 'Hi' } }),
        step('s1', 2, { input: { messages: [], messages_offset: 0 } }),
    ]

    it('shows only the tree until a span is named in the URL, then the evidence with a way back', async () => {
        await open(spans())

        expect(screen.getByRole('tree')).toBeVisible()
        expect(
            screen.queryByRole('region', { name: 'Span evidence' }),
        ).not.toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: 'Execution tree' }),
        ).not.toBeInTheDocument()

        await userEvent.click(
            screen.getByRole('treeitem', { name: 'Model step 1, Completed' }),
        )

        expect(params().get('span')).toBe('s1')
        expect(
            await screen.findByRole('region', { name: 'Span evidence' }),
        ).toBeVisible()
        expect(
            panel().getByRole('heading', { level: 2, name: 'Model step 1' }),
        ).toBeInTheDocument()

        await userEvent.click(
            screen.getByRole('button', { name: 'Execution tree' }),
        )

        await waitFor(() => expect(params().has('span')).toBe(false))
        expect(screen.getByRole('tree')).toBeVisible()
        expect(
            screen.queryByRole('region', { name: 'Span evidence' }),
        ).not.toBeInTheDocument()
    })

    it('opens on the evidence of a span the URL names', async () => {
        await open(spans(), { search: '?span=s1', evidenceOnly: true })

        expect(
            screen.getByRole('region', { name: 'Span evidence' }),
        ).toBeVisible()
        expect(
            screen.queryByRole('region', { name: 'Execution tree' }),
        ).not.toBeInTheDocument()
    })
})

describe('wide screens', () => {
    it('show the tree and the evidence of the default selection together', async () => {
        await open([root({ input: { prompt: 'Hi' } })])

        expect(
            screen.getByRole('region', { name: 'Execution tree' }),
        ).toBeVisible()
        expect(
            screen.getByRole('region', { name: 'Span evidence' }),
        ).toBeVisible()
        expect(
            screen.queryByRole('button', { name: 'Execution tree' }),
        ).not.toBeInTheDocument()
        expect(params().has('span')).toBe(false)
    })
})

describe('the link back to the list', () => {
    it.each([1024, 500])(
        'sits above the name of the run when the window is %i wide',
        async (width) => {
            window.innerWidth = width
            await open([root()])

            const link = screen.getByRole('link', { name: 'Back to traces' })
            const name = screen.getByRole('heading', { level: 1 })

            expect(link).toHaveAttribute('href', '/trail/traces')
            expect(
                link.compareDocumentPosition(name) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy()
        },
    )

    it('keeps the time range', async () => {
        await open([root()], { search: '?range=7d&span=root' })

        expect(
            screen.getByRole('link', { name: 'Back to traces' }),
        ).toHaveAttribute('href', '/trail/traces?range=7d')
    })
})

describe('focus after opening a span from inside the panel', () => {
    /** An agent, a tool that started another agent, and that agent's step. */
    const delegated = () => [
        root(),
        tool('t1', 2, { name: 'ask', input: { arguments: {} } }),
        makeAgentSpan('a2', {
            sequence: 3,
            parent_id: 't1',
            name: 'Research',
        }),
        makeStepSpan('s9', {
            sequence: 4,
            parent_id: 'a2',
            step_number: 0,
        }),
    ]
    const heading = (name: string) =>
        panel().getByRole('heading', { level: 2, name })

    it('moves to the heading of the new span after pressing "Open the agent it started"', async () => {
        await open(delegated(), { search: '?span=t1' })

        await userEvent.click(
            panel().getByRole('button', { name: 'Open the agent it started' }),
        )

        await waitFor(() => expect(heading('Research')).toHaveFocus())
    })

    it('moves to the heading after pressing an ancestor crumb', async () => {
        await open(delegated(), { search: '?span=s9' })

        await userEvent.click(
            screen.getByRole('button', { name: 'SupportAssistant' }),
        )

        await waitFor(() => expect(heading('SupportAssistant')).toHaveFocus())
        expect(params().get('span')).toBe('root')
    })

    it('moves to the heading after "Open tool span"', async () => {
        await open(
            [
                root(),
                step('s0', 2, {
                    output: {
                        text: '',
                        tool_calls: [
                            { id: 'c0', name: 'search', arguments: { q: 1 } },
                        ],
                        finish_reason: 'tool_use',
                    },
                }),
                tool('t', 3, {
                    name: 'search',
                    input: { arguments: { q: 1 } },
                }),
            ],
            { search: '?span=s0&tab=output' },
        )

        await userEvent.click(
            panel().getByRole('button', { name: 'Open tool span search' }),
        )

        await waitFor(() => expect(heading('search')).toHaveFocus())
    })

    it('puts the pane back at the top', async () => {
        await open(delegated(), { search: '?span=t1' })
        const pane = document.querySelector(
            '[data-slot="evidence-panel"]',
        )!.parentElement!

        Object.defineProperty(pane, 'scrollTop', {
            value: 120,
            writable: true,
            configurable: true,
        })

        await userEvent.click(
            panel().getByRole('button', { name: 'Open the agent it started' }),
        )

        await waitFor(() => expect(pane.scrollTop).toBe(0))
    })

    it('leaves focus on the tree row when the span was chosen in the tree', async () => {
        await open(delegated())
        const row = screen.getByRole('treeitem', {
            name: 'SupportAssistant, Completed',
        })

        row.focus()
        await userEvent.keyboard('{ArrowDown}{Enter}')

        const chosen = screen
            .getAllByRole('treeitem')
            .find((item) => item.getAttribute('aria-selected') === 'true')

        expect(chosen).toHaveFocus()
        expect(panel().getByRole('heading', { level: 2 })).not.toHaveFocus()
    })

    it('does not move focus on first load', async () => {
        await open(delegated(), { search: '?span=t1' })

        expect(document.body).toHaveFocus()
    })

    it('does not move focus later when the same span is reached from the tree', async () => {
        await open(delegated(), { search: '?span=t1' })

        await userEvent.click(
            panel().getByRole('button', { name: 'Open the agent it started' }),
        )
        await waitFor(() => expect(heading('Research')).toHaveFocus())

        const row = screen.getByRole('treeitem', { name: 'ask, Completed' })

        await userEvent.click(row)
        await userEvent.click(
            screen.getByRole('treeitem', { name: 'Research, Completed' }),
        )

        expect(
            screen.getByRole('treeitem', { name: 'Research, Completed' }),
        ).toHaveFocus()
    })
})

describe('tool calls and the tools that ran them', () => {
    const toolCalls = (
        ...calls: { id?: string; name: string; arguments?: JsonValue }[]
    ): JsonValue => ({
        text: '',
        tool_calls: calls.map((call) => ({
            ...(call.id === undefined ? {} : { id: call.id }),
            name: call.name,
            arguments: call.arguments ?? {},
        })),
        finish_reason: 'tool_use',
    })
    const none = 'No tool span was recorded for this call'

    it('links nothing when the arguments of the only candidate differ', async () => {
        await open(
            [
                root(),
                step('s0', 2, {
                    output: toolCalls({
                        name: 'search',
                        arguments: { q: 'A' },
                    }),
                }),
                tool('t', 3, {
                    name: 'search',
                    input: { arguments: { q: 'other' } },
                }),
            ],
            { search: '?span=s0&tab=output' },
        )

        expect(
            panel().queryByRole('button', { name: /^Open tool span/ }),
        ).not.toBeInTheDocument()
        expect(panel().getByText(none)).toBeInTheDocument()
    })

    it('links the call that ran by its arguments when an earlier call of the same tool did not', async () => {
        await open(
            [
                root(),
                step('s0', 2, {
                    output: toolCalls(
                        { name: 'search', arguments: { q: 'A' } },
                        { name: 'search', arguments: { q: 'B' } },
                    ),
                }),
                tool('only', 3, {
                    name: 'search',
                    input: { arguments: { q: 'B' } },
                }),
            ],
            { search: '?span=s0&tab=output' },
        )

        expect(
            panel().getAllByRole('button', { name: /^Open tool span/ }),
        ).toHaveLength(1)
        expect(panel().getAllByText(none)).toHaveLength(1)

        await userEvent.click(
            panel().getByRole('button', { name: /^Open tool span/ }),
        )

        expect(params().get('span')).toBe('only')
    })

    it('says not started yet while the run is running', async () => {
        await open(
            [
                root({ status: 'running', duration_ms: null, ended_at: null }),
                step('s0', 2, {
                    output: toolCalls({ name: 'search', arguments: { q: 1 } }),
                }),
            ],
            { search: '?span=s0&tab=output', trace: { status: 'running' } },
        )

        expect(panel().getByText('Not started yet')).toBeInTheDocument()
    })

    it('says waiting for approval for a call the run waits on, and nothing recorded for another', async () => {
        await open(
            [
                root(),
                step('s0', 2, {
                    output: toolCalls(
                        { id: 'c0', name: 'refund', arguments: { n: 1 } },
                        { id: 'c1', name: 'refund', arguments: { n: 2 } },
                    ),
                }),
            ],
            {
                search: '?span=s0&tab=output',
                trace: { status: 'awaiting_approval' },
                pendingApprovals: [
                    {
                        tool_call_id: 'c1',
                        tool: 'refund',
                        arguments: { n: 2 },
                        reason: null,
                    },
                ],
            },
        )

        expect(panel().getAllByText('Waiting for approval')).toHaveLength(1)
        expect(panel().getAllByText(none)).toHaveLength(1)
    })

    it('makes no claim about a call whose name cannot be read', async () => {
        await open(
            [
                root(),
                step('s0', 2, {
                    output: {
                        text: '',
                        tool_calls: ['not an object'],
                        finish_reason: 'tool_use',
                    },
                }),
            ],
            { search: '?span=s0&tab=output' },
        )

        expect(panel().queryByText(none)).not.toBeInTheDocument()
        expect(panel().queryByText('Not started yet')).not.toBeInTheDocument()
        expect(
            panel().queryByRole('button', { name: /^Open tool span/ }),
        ).not.toBeInTheDocument()
    })

    it('names the tool in each "Open tool span" button, and tells repeated calls apart in the viewers', async () => {
        await open(
            [
                root(),
                step('s0', 2, {
                    output: toolCalls(
                        { name: 'search', arguments: { q: 1 } },
                        { name: 'search', arguments: { q: 2 } },
                        { name: 'lookup', arguments: { id: 7 } },
                    ),
                }),
                tool('a', 3, {
                    name: 'search',
                    input: { arguments: { q: 1 } },
                }),
                tool('b', 4, {
                    name: 'search',
                    input: { arguments: { q: 2 } },
                }),
                tool('c', 5, {
                    name: 'lookup',
                    input: { arguments: { id: 7 } },
                }),
            ],
            { search: '?span=s0&tab=output' },
        )

        expect(
            panel()
                .getAllByRole('button', { name: /^Open tool span/ })
                .map((button) => button.getAttribute('aria-label')),
        ).toEqual([
            'Open tool span search',
            'Open tool span search',
            'Open tool span lookup',
        ])
        expect(group('call 1 search arguments')).toBeInTheDocument()
        expect(group('call 2 search arguments')).toBeInTheDocument()
        expect(group('lookup arguments')).toBeInTheDocument()
    })
})

describe('what makes a tab', () => {
    it('offers no input tab for a tool whose arguments are null, and shows an unexpected shape whole', async () => {
        await open([root(), tool('t', 2, { input: { arguments: null } })], {
            search: '?span=t',
        })

        expect(tabNames()).toEqual(['Metadata', 'Raw'])
    })

    it('shows a tool input of unexpected keys whole instead of saying nothing was captured', async () => {
        await open([root(), tool('t', 2, { input: { query: 'x' } })], {
            search: '?span=t',
        })

        expect(tabNames()).toContain('Input')
        expect(group('input')).toBeInTheDocument()
        expect(panel().queryByText('Not captured')).not.toBeInTheDocument()
    })

    it('offers no output tab for a tool whose result is null', async () => {
        await open(
            [
                root(),
                tool('t', 2, {
                    input: { arguments: { a: 1 } },
                    output: { result: null },
                }),
            ],
            { search: '?span=t' },
        )

        expect(tabNames()).toEqual(['Input', 'Metadata', 'Raw'])
    })

    it('offers neither payload tab for an embedding with no count or size, and says nothing was stored', async () => {
        await open(
            [
                makeEmbeddingSpan('e', {
                    sequence: 1,
                    input: { count: null, dimensions: null },
                    output: { count: null },
                }),
            ],
            {},
        )

        expect(tabNames()).toEqual(['Metadata', 'Raw'])
        expect(
            panel().getByText('No input or output was stored for this span.'),
        ).toBeInTheDocument()
    })

    it('offers only an output tab for a step with calls and nothing sent', async () => {
        await open(
            [
                root(),
                step('s', 2, {
                    input: { messages: [], messages_offset: 0, options: null },
                    output: {
                        text: '',
                        tool_calls: [{ id: 'c', name: 'a', arguments: {} }],
                    },
                }),
            ],
            { search: '?span=s' },
        )

        expect(tabNames()).toEqual(['Output', 'Metadata', 'Raw'])
    })

    it('offers no output tab for an agent whose text is empty and has no structured output', async () => {
        await open([root({ input: { prompt: 'Hi' }, output: { text: '' } })])

        expect(tabNames()).toEqual(['Input', 'Metadata', 'Raw'])
    })
})

describe('the system prompt of an agent', () => {
    it('says before it is opened that the stored prompt was cut short, and how long it was', async () => {
        await open([
            root({
                input: { system: 'x'.repeat(50), prompt: 'Hi' },
                truncated: true,
                truncated_paths: { 'input.system': 210 },
            }),
        ])

        const row = panel().getByRole('button', { name: /System prompt/ })

        expect(row).toHaveTextContent('50 chars · cut short')

        await userEvent.click(row)

        expect(screen.getByText('It was 210 characters.')).toBeInTheDocument()
    })

    it('has no such mark when the prompt is whole', async () => {
        await open([root({ input: { system: 'x'.repeat(50), prompt: 'Hi' } })])

        expect(
            panel().getByRole('button', { name: /System prompt/ }),
        ).not.toHaveTextContent('cut short')
    })

    it('says none was stored, with the cause the run reports', async () => {
        await open([root({ input: { prompt: 'Hi', system: null } })])

        expect(
            panel().getByText(
                'No system prompt was stored for this agent. Payload capture did not store it.',
            ),
        ).toBeInTheDocument()
    })

    it('says only that none was stored when the run reports no gap', async () => {
        await open([root({ input: { prompt: 'Hi', system: null } })], {
            coverage: {
                system_prompt: {
                    state: 'captured',
                    captured: 1,
                    expected: 1,
                    reason: null,
                },
            },
        })

        expect(
            panel().getByText('No system prompt was stored for this agent.'),
        ).toBeInTheDocument()
    })
})

describe('the responding model in the metadata', () => {
    it('reads Pending for a step that is still running', async () => {
        await open(
            [
                root(),
                step('s', 2, {
                    status: 'running',
                    responding_model: null,
                    duration_ms: null,
                    ended_at: null,
                }),
            ],
            { search: '?span=s&tab=metadata' },
        )

        const item = panel().getByText('Responding model').closest('div')!

        expect(within(item).getByText('Pending')).toBeInTheDocument()
    })

    it('says why a completed step has none when the run was streamed', async () => {
        await open([root(), step('s', 2, { responding_model: null })], {
            search: '?span=s&tab=metadata',
            coverage: {
                responding_model: {
                    state: 'not_captured',
                    captured: 0,
                    expected: 1,
                    reason: 'streamed',
                },
            },
        })

        expect(
            panel().getByText('Not captured (streamed runs do not report it)'),
        ).toBeInTheDocument()
    })

    it('says Not captured, without a cause, otherwise', async () => {
        await open([root(), step('s', 2, { responding_model: null })], {
            search: '?span=s&tab=metadata',
            coverage: {
                responding_model: {
                    state: 'partial',
                    captured: 1,
                    expected: 2,
                    reason: 'not_reported',
                },
            },
        })

        const item = panel().getByText('Responding model').closest('div')!

        expect(within(item).getByText('Not captured')).toBeInTheDocument()
    })
})

describe('the usage of an embedding', () => {
    it('is on the input tab, with its token breakdown and cost, as well as in the metadata', async () => {
        await open([
            makeEmbeddingSpan('e', {
                sequence: 1,
                input: { count: 2, dimensions: null },
                output: { count: 2 },
            }),
        ])

        expect(
            panel().getByRole('heading', { name: 'Usage' }),
        ).toBeInTheDocument()
        const usage = within(
            document.querySelector(
                '[data-slot="embedding-usage"]',
            ) as HTMLElement,
        )

        expect(usage.getByText('Input tokens')).toBeInTheDocument()
        expect(usage.getByText('Total tokens')).toBeInTheDocument()
        expect(
            document.querySelector(
                '[data-slot="embedding-usage"] [data-slot="cost-value"]',
            ),
        ).toBeInTheDocument()

        await openTab('Metadata')

        expect(panel().getByText('Input tokens')).toBeInTheDocument()
    })

    it('is on the output tab when the input has nothing to show', async () => {
        await open([
            makeEmbeddingSpan('e', {
                sequence: 1,
                input: null,
                output: { count: 2 },
            }),
        ])

        expect(
            panel().getByRole('heading', { name: 'Usage' }),
        ).toBeInTheDocument()
    })
})

describe('the raw tab and cut-short values', () => {
    it('says once that parts of the span were cut short when it has cut paths', async () => {
        await open(
            [
                root({
                    input: { prompt: 'Hi' },
                    truncated: true,
                    truncated_paths: { 'input.prompt': 90 },
                }),
            ],
            { search: '?tab=raw' },
        )

        expect(
            panel().getAllByText(
                'Some values in this span were cut short when stored',
            ),
        ).toHaveLength(1)
        expect(
            panel().queryByText('This value was cut short when it was stored.'),
        ).not.toBeInTheDocument()
    })

    it('says nothing of the kind for a span that was not cut', async () => {
        await open([root({ input: { prompt: 'Hi' } })], {
            search: '?tab=raw',
        })

        expect(panel().queryByText(/cut short/)).not.toBeInTheDocument()
    })

    it('uses the own path of a tool call that is not an object, and labels a message that is not one', async () => {
        await open(
            [
                root(),
                step('s', 2, {
                    input: {
                        messages: ['plain text'],
                        messages_offset: 0,
                        options: null,
                    },
                    truncated: true,
                    truncated_paths: { 'input.messages.0': 33 },
                }),
            ],
            { search: '?span=s' },
        )

        const item = messageItems()[0]

        expect(item).toHaveAccessibleName('Message 1')
        expect(within(item).getByText('Message 1')).toBeInTheDocument()
        expect(
            within(item).getByText('It was 33 characters.'),
        ).toBeInTheDocument()
    })

    it('uses the own path of a tool call item that is not an object', async () => {
        await open(
            [
                root(),
                step('s', 2, {
                    input: {
                        messages: [
                            { role: 'assistant', tool_calls: ['bare call'] },
                        ],
                        messages_offset: 0,
                        options: null,
                    },
                    truncated: true,
                    truncated_paths: { 'input.messages.0.tool_calls.0': 40 },
                }),
            ],
            { search: '?span=s' },
        )

        expect(
            within(messageItems()[0]).getByText('It was 40 characters.'),
        ).toBeInTheDocument()
    })
})

describe('accessible names in the evidence', () => {
    it('names the evidence tabs apart from the region, and tells viewers of different messages apart', async () => {
        await open(
            [
                root(),
                step('s', 2, {
                    input: {
                        messages: [
                            { role: 'user', content: 'Hi' },
                            {
                                role: 'assistant',
                                tool_calls: [
                                    {
                                        id: 'c',
                                        name: 'check_inventory',
                                        arguments: { sku: 1 },
                                    },
                                    {
                                        id: 'd',
                                        name: 'check_inventory',
                                        arguments: { sku: 2 },
                                    },
                                ],
                            },
                        ],
                        messages_offset: 1,
                        options: null,
                    },
                }),
            ],
            { search: '?span=s' },
        )

        expect(
            screen.getByRole('tablist', { name: 'Evidence' }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole('region', { name: 'Span evidence' }),
        ).toBeInTheDocument()
        expect(group('message 2 text')).toBeInTheDocument()
        expect(
            group('message 3 call 1 check_inventory arguments'),
        ).toBeInTheDocument()
        expect(
            group('message 3 call 2 check_inventory arguments'),
        ).toBeInTheDocument()
        expect(
            panel().getByRole('button', {
                name: 'Copy message 3 call 2 check_inventory arguments',
            }),
        ).toBeInTheDocument()
    })

    it('gives the span heading a title with its full name', async () => {
        await open([root({ name: 'A very long agent name' })])

        expect(panel().getByRole('heading', { level: 2 })).toHaveAttribute(
            'title',
            'A very long agent name',
        )
    })
})

describe('the evidence tabs with the keyboard', () => {
    it('moves with the arrow keys, shows the tab and writes it to the URL', async () => {
        await open([root({ input: { prompt: 'Hi' }, output: { text: 'Yo' } })])

        screen.getByRole('tab', { name: 'Input' }).focus()
        await userEvent.keyboard('{ArrowRight}')

        await waitFor(() => expect(params().get('tab')).toBe('output'))
        expect(activeTabName()).toBe('Output')
        expect(screen.getByText('Yo')).toBeVisible()

        await userEvent.keyboard('{End}')

        await waitFor(() => expect(params().get('tab')).toBe('raw'))
        expect(activeTabName()).toBe('Raw')
    })
})

describe('the tab on a narrow screen', () => {
    it('is kept when going back to the tree and opening a span again', async () => {
        window.innerWidth = 500
        await open(
            [
                root(),
                step('s1', 2, {
                    input: {
                        messages: [{ role: 'user', content: 'Hi' }],
                        messages_offset: 0,
                        options: null,
                    },
                    output: { text: 'Answer' },
                }),
            ],
            { search: '?span=s1&tab=output', evidenceOnly: true },
        )

        expect(activeTabName()).toBe('Output')

        await userEvent.click(
            screen.getByRole('button', { name: 'Execution tree' }),
        )
        await waitFor(() => expect(params().has('span')).toBe(false))
        expect(params().get('tab')).toBe('output')

        await userEvent.click(
            screen.getByRole('treeitem', { name: 'Model step 1, Completed' }),
        )

        expect(
            await screen.findByRole('tablist', { name: 'Evidence' }),
        ).toBeVisible()
        expect(activeTabName()).toBe('Output')
    })
})
