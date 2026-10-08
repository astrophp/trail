/**
 * The route of a conversation's page, relative to the dashboard's base path. A conversation id is
 * any string the host application chose (slashes, dots, spaces, non-ASCII), so it is one path
 * segment, encoded here and nowhere else.
 */
export function conversationPath(id: string): string {
    return `/conversations/${encodeURIComponent(id)}`
}
