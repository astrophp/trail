import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { makeStepSpan } from '@/test/trace-api'
import { CapabilityPanel } from '@/features/trace/capability-panel'

it('shows provider result order with original indexes and labels relevance as a score', () => {
    render(
        <CapabilityPanel
            side="output"
            span={makeStepSpan('rank', {
                type: 'reranking',
                sequence: 1,
                output: {
                    result_count: 2,
                    results: [
                        { index: 2, score: 0.9 },
                        { index: 0, score: 0.4 },
                    ],
                    omitted_entries: 3,
                },
            })}
        />,
    )
    expect(
        screen.getByRole('heading', { name: 'Rank 1 · Document index 2' }),
    ).toBeInTheDocument()
    expect(
        screen.getByRole('heading', { name: 'Rank 2 · Document index 0' }),
    ).toBeInTheDocument()
    expect(
        screen.getAllByText('Provider relevance score; not a probability.'),
    ).toHaveLength(2)
    expect(screen.getByRole('note')).toHaveTextContent('3 entries omitted')
})

it('shows the probability of true and keeps capture-disabled counts visible without answer content', () => {
    const { rerender } = render(
        <CapabilityPanel
            side="output"
            span={makeStepSpan('class', {
                type: 'classification',
                sequence: 1,
                output: {
                    answer_count: 1,
                    answers: { valid: { type: 'boolean', probability: 0.7 } },
                },
            })}
        />,
    )
    expect(
        screen.getByText('Probability of true, as reported by the provider.'),
    ).toBeInTheDocument()
    rerender(
        <CapabilityPanel
            side="output"
            span={makeStepSpan('class', {
                type: 'classification',
                sequence: 1,
                output: { answer_count: 3 },
            })}
        />,
    )
    expect(
        screen.getByText('No answers content was stored.'),
    ).toBeInTheDocument()
    expect(
        screen.queryByText('Probability of true, as reported by the provider.'),
    ).not.toBeInTheDocument()
})

it('preserves unexpected stored collection shapes through the whole-payload viewer', async () => {
    render(
        <CapabilityPanel
            side="output"
            span={makeStepSpan('class', {
                sequence: 1,
                type: 'classification',
                output: {
                    answer_count: 1,
                    answers: [
                        { type: 'choice', choice: 'numeric-question-key' },
                    ],
                },
            })}
        />,
    )
    expect(screen.getByRole('group', { name: 'output' })).toHaveAttribute(
        'data-slot',
        'payload-viewer',
    )
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Raw' }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
        'numeric-question-key',
    )
    expect(
        screen.queryByText('No answers content was stored.'),
    ).not.toBeInTheDocument()
})
