import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
    conversationListApiParams,
    type ConversationListView,
} from '@/api/conversation-list-view'
import { conversationKeys, fetchConversations } from '@/api/conversations'

/**
 * The conversations for a view. The previous view's response stays as placeholder data until the
 * next one arrives, so a caller must check `isPlaceholderData` before treating it as the answer.
 */
export function useConversations(view: ConversationListView) {
    return useQuery({
        queryKey: [...conversationKeys.list, view],
        queryFn: ({ signal }) =>
            fetchConversations(conversationListApiParams(view), signal),
        placeholderData: keepPreviousData,
    })
}
