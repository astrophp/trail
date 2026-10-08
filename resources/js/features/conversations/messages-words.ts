import type { MessagesReason } from '@/api/types'

/** What a turn whose messages are all there is says nothing about; one with none says this. */
export const notStoredTitle = 'No messages were stored for this turn.'

export const partialTitle = 'Some messages of this turn may be missing'

const couldNotBePlaced =
    'Some messages of this turn could not be placed and may be missing.'

/**
 * Why a turn's messages are incomplete, in words that claim no more than the API's reasons do.
 * Four of them mean the same to a reader: the stored messages do not line up, so some may be
 * missing. Only a cut at the span limit says something else.
 */
export const partialReasonWords: Record<MessagesReason, string> = {
    span_limit: 'Only the first spans of this run were read.',
    offset_gap: couldNotBePlaced,
    history_rewritten: couldNotBePlaced,
    history_boundary_unknown: couldNotBePlaced,
    step_input_missing: couldNotBePlaced,
}
