import type { Conversation, TranscriptResponse, Turn } from '@/api/types'

/**
 * What a conversation's page holds: the turns loaded so far as one run of the conversation (oldest
 * first, no gap), the conversation's figures as of the last answer, and how many turns lie outside
 * the run on each side, as the database counted them in the answer that set them.
 */
export type TranscriptData = {
    conversation: Conversation
    turns: Turn[]
    /** Turns before the first one loaded. */
    older: number
    /** Turns after the last one loaded. */
    newer: number
    /** The turn the address named when the conversation does not have it (any more), else `null`. */
    missing: string | null
}

/** Whether the answer was cut around the run it was asked about, which is the one it is good for. */
function placed(response: TranscriptResponse): boolean {
    return response.window.anchor === null || response.window.anchor.found
}

/** The data a first answer is. A named turn that is not there leaves the newest window and says so. */
export function fromWindow(response: TranscriptResponse): TranscriptData {
    const anchor = response.window.anchor

    return {
        conversation: response.data.conversation,
        turns: response.data.turns,
        older: response.window.older,
        newer: response.window.newer,
        missing: anchor !== null && !anchor.found ? anchor.id : null,
    }
}

/** The turns of `added` that `held` does not have yet. */
function unseen(held: readonly Turn[], added: readonly Turn[]): Turn[] {
    const ids = new Set(held.map((turn) => turn.trace.id))

    return added.filter((turn) => !ids.has(turn.trace.id))
}

/** The window before the first turn loaded, put before it. An answer for a turn that is gone changes nothing. */
export function withEarlier(
    data: TranscriptData,
    response: TranscriptResponse,
): TranscriptData {
    if (!placed(response)) {
        return data
    }

    return {
        ...data,
        conversation: response.data.conversation,
        turns: [...unseen(data.turns, response.data.turns), ...data.turns],
        older: response.window.older,
    }
}

/** The window after the last turn loaded, put after it. An answer for a turn that is gone changes nothing. */
export function withLater(
    data: TranscriptData,
    response: TranscriptResponse,
): TranscriptData {
    if (!placed(response)) {
        return data
    }

    return {
        ...data,
        conversation: response.data.conversation,
        turns: [...data.turns, ...unseen(data.turns, response.data.turns)],
        newer: response.window.newer,
    }
}

/**
 * What a refresh brings back: one answer for each turn that was asked for by itself (`turn` with
 * `limit` 1), and, when the newest window was loaded, the turns after the last one (`later`).
 * The answers are put into the turns held by id, so what else is loaded stays as it is.
 */
export function withRefreshed(
    data: TranscriptData,
    each: readonly TranscriptResponse[],
    later: TranscriptResponse | null,
): TranscriptData {
    const fresh = new Map<string, Turn>()
    let conversation = data.conversation

    for (const response of each) {
        // A turn that was asked for and is no longer recorded answers with other turns: not its own.
        if (!placed(response)) {
            continue
        }

        conversation = response.data.conversation

        for (const turn of response.data.turns) {
            fresh.set(turn.trace.id, turn)
        }
    }

    const turns = data.turns.map((turn) => fresh.get(turn.trace.id) ?? turn)

    if (later === null || !placed(later)) {
        return { ...data, conversation, turns }
    }

    return {
        ...data,
        conversation: later.data.conversation,
        turns: [...turns, ...unseen(turns, later.data.turns)],
        newer: later.window.newer,
    }
}

/** Whether a turn is still running, which is what the page refreshes. */
export const isRunning = (turn: Turn): boolean =>
    turn.trace.status === 'running'
