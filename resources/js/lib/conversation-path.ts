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
