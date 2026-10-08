import { useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { isNotFound } from '@/api/client'
import { conversationKeys, fetchTranscript } from '@/api/conversations'
import { numberTurns } from '@/features/conversations/transcript-turns'

/**
 * One conversation's transcript, newest window first and older ones on request. The windows are
 * pages of one infinite query keyed by the id: an older window is put before the ones already
 * loaded. There is no placeholder data, so another conversation never shows the previous one's
 * turns. An empty id asks for nothing.
 */
export function useTranscript(id: string) {
    const query = useInfiniteQuery({
        enabled: id !== '',
        queryKey: conversationKeys.transcript(id),
        queryFn: ({ pageParam, signal }) =>
            fetchTranscript({ id, before: pageParam }, signal),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: () => undefined,
        // The window before the first loaded turn, while the database counts turns before it.
        getPreviousPageParam: (first) =>
            first.window.older > 0 ? first.data.turns[0]?.trace.id : undefined,
    })
    const pages = query.data?.pages
    const [olderFailure, setOlderFailure] = useState<{ error: unknown } | null>(
        null,
    )
    const { fetchPreviousPage } = query

    // The error stays until a load succeeds, so the retry button is never replaced under focus.
    const loadEarlier = useCallback(async () => {
        const result = await fetchPreviousPage()

        setOlderFailure(result.isError ? { error: result.error } : null)
    }, [fetchPreviousPage])

    const turns = useMemo(() => numberTurns(pages ?? []), [pages])
    // The earliest window fetched last carries the conversation's figures as of now.
    const latest = pages?.[0]

    return {
        /** The conversation as the newest answer states it; `undefined` until a window is in. */
        conversation: latest?.data.conversation,
        turns,
        /** Turns before the first loaded one, counted by the database. */
        older: latest?.window.older ?? 0,
        loading: query.isPending && id !== '',
        notFound:
            id === '' || (query.data === undefined && isNotFound(query.error)),
        /** The first load failed (not a 404). */
        failed:
            id !== '' &&
            query.isError &&
            query.data === undefined &&
            !isNotFound(query.error),
        error: query.error,
        retry: () => void query.refetch(),
        retrying: query.isFetching && query.data === undefined,
        loadEarlier,
        loadingEarlier: query.isFetchingPreviousPage,
        olderFailure,
    }
}
