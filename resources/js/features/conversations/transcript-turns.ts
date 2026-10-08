import type { Message, TranscriptResponse, Turn } from '@/api/types'

/** A loaded turn with its place in the whole conversation. */
export type NumberedTurn = {
    turn: Turn
    /** Counted from 1 over the whole conversation: the turns before the first loaded one, then its place among those loaded. */
    number: number
}

/**
 * The loaded windows as one list of turns, oldest first, each numbered by its place in the whole
 * conversation: the count of turns before the earliest window (`window.older`, counted by the
 * database), plus its index among the loaded turns, plus one. A turn two windows both hold is
 * listed once.
 */
export function numberTurns(
    pages: readonly TranscriptResponse[],
): NumberedTurn[] {
    if (pages.length === 0) {
        return []
    }

    const seen = new Set<string>()
    const turns: Turn[] = []

    // The later window wins: it was asked for last.
    for (const page of [...pages].reverse()) {
        for (const turn of [...page.data.turns].reverse()) {
            if (!seen.has(turn.trace.id)) {
                seen.add(turn.trace.id)
                turns.push(turn)
            }
        }
    }

    turns.reverse()

    const before = pages[0].window.older

    return turns.map((turn, index) => ({ turn, number: before + index + 1 }))
}

/** The prompt of a turn, or `undefined` when it starts at a tool result. */
export function promptOf(turn: Turn): Message | undefined {
    return turn.messages.find((message) => message.part === 'prompt')
}

/** The response that ended a turn, or `undefined` when it has none. */
export function responseOf(turn: Turn): Message | undefined {
    return turn.messages.find((message) => message.part === 'response')
}

/** Everything the turn exchanged between its prompt and its response, in order. */
export function activityOf(turn: Turn): Message[] {
    return turn.messages.filter((message) => message.part === 'activity')
}

/** How many characters of a prompt the jump list shows. */
const PROMPT_START_LENGTH = 100

/**
 * The first words of a prompt (a short excerpt, whitespace collapsed, never the whole text), or
 * `null` when the turn has no prompt, it is empty or it is not text.
 */
export function promptStart(turn: Turn): string | null {
    const content = promptOf(turn)?.content

    if (typeof content !== 'string') {
        return null
    }

    const looked = PROMPT_START_LENGTH * 4
    // Only the head is looked at, so a very long prompt costs nothing.
    const head = content.slice(0, looked).replace(/\s+/g, ' ').trim()

    if (head === '') {
        return null
    }

    if (head.length <= PROMPT_START_LENGTH && content.length <= looked) {
        return head
    }

    let end = Math.min(head.length, PROMPT_START_LENGTH)
    const last = head.charCodeAt(end - 1)

    // Do not cut a character in two.
    if (last >= 0xd800 && last <= 0xdbff) {
        end -= 1
    }

    return `${head.slice(0, end).trimEnd()}…`
}

/** The element ids the page jumps to and moves focus to. */
export const turnDomId = (traceId: string) => `turn-${traceId}`
export const turnHeadingDomId = (traceId: string) => `turn-${traceId}-heading`
