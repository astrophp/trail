/**
 * The route of a conversation's page, relative to the dashboard's base path. A conversation id is
 * any string the host application chose (slashes, dots, spaces, non-ASCII), so it travels in the
 * query, encoded here and nowhere else.
 */
export function conversationPath(id: string): string {
    return `/conversations/transcript?${new URLSearchParams({ id }).toString()}`
}

/** The path the conversation page is served at, without its query. */
export const transcriptPath = '/conversations/transcript'

/**
 * The conversation's page opened at one of its turns (a run's id): the `turn` parameter of the
 * page, which loads the window of turns ending at that one.
 */
export function conversationTurnPath(id: string, turn: string): string {
    return `${transcriptPath}?${new URLSearchParams({ id, turn }).toString()}`
}

/**
 * `from`, a path of the conversation's page and its query, with its `turn` replaced by `turn`:
 * where a page opened from one turn leads back to after it has stepped to another. Anything that
 * is not a path of the conversation's page is returned as it was.
 */
export function withTurn(from: string, turn: string): string {
    const url = new URL(from, 'http://x')

    if (url.pathname !== transcriptPath) {
        return from
    }

    url.searchParams.set('turn', turn)

    return `${url.pathname}${url.search}`
}

/**
 * The list of runs filtered to one conversation: the list's `conversation` parameter. It carries
 * no time range, so the list applies its own, and shows the conversation's runs within it.
 */
export function conversationRunsPath(id: string): string {
    return `/traces?${new URLSearchParams({ conversation: id }).toString()}`
}
