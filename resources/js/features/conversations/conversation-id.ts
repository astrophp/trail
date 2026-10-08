import { shortId } from '@/lib/format'

/** A host-app id up to this many characters is shown whole; a longer one, such as an SDK uuid, is shortened. */
export const longestWholeId = 16

/** A conversation's id as the pages write it: whole when short, else shortened in the middle. */
export function conversationIdText(id: string): string {
    return shortId(id, longestWholeId)
}
