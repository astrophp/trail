import { useEffect, useRef, useState, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { SearchField } from '@/components/patterns/search-field'
import { normalizeSearch } from '@/features/traces/trace-list-params'

/** How long typing must pause before the text is acted on. */
const pause = 300

/** The API reads at most this many characters of a search. */
const maxLength = 200

type TraceSearchProps = {
    /** The search the URL has. */
    value: string
    /** Called with the text to search for. `replace` is for a change in the same typing session. */
    onCommit: (value: string, options: { replace: boolean }) => void
    inputRef: RefObject<HTMLInputElement | null>
    className?: string
}

/** The key of the history entry the browser is on; React Router keeps it in the entry's state. */
const entryKey = () =>
    (window.history.state as { key?: string } | null)?.key ?? 'default'

/**
 * The search box. What is typed stays in the box (a draft) and reaches the URL after a pause of
 * 300 ms, on Enter, or when the box loses focus, so a request is not made per keystroke. Nothing
 * is written while an IME composition is open; a blur ends it.
 *
 * History: a typing session is one history entry. Its first write pushes an entry, later writes
 * replace it, and a write that would return to the search the session started from goes Back one
 * entry instead (so no entry repeats the one before it, whether the box was emptied by Backspace,
 * by the clear button or by retyping, and the session is then over). A session also ends when
 * focus leaves the box (its clear button counts as the box) and on any location change this box did not make (Back, Forward, a chip, a
 * link), which also drops a write that was waiting and puts the URL's search in the box.
 */
export function TraceSearch({
    value,
    onCommit,
    inputRef,
    className,
}: TraceSearchProps) {
    const { key } = useLocation()
    const navigate = useNavigate()
    const [draft, setDraft] = useState(value)
    // The search the URL holds as far as this box knows, and the entry its last write made.
    const written = useRef(value)
    const ownKey = useRef(key)
    const waiting = useRef<number | null>(null)
    const session = useRef<{ start: string } | null>(null)
    const composing = useRef(false)

    const cancel = () => {
        if (waiting.current !== null) {
            window.clearTimeout(waiting.current)
            waiting.current = null
        }
    }

    // A location this box did not make: the URL wins over anything typed and not yet written.
    useEffect(() => {
        if (key !== ownKey.current) {
            ownKey.current = key
            written.current = value
            session.current = null
            composing.current = false
            cancel()
            setDraft(value)
        }
    }, [key, value])

    useEffect(() => cancel, [])

    const write = (text: string) => {
        cancel()

        const start = session.current?.start

        if (text === written.current) {
            return
        }

        if (start === text) {
            session.current = null
            void navigate(-1)

            return
        }

        session.current ??= { start: written.current }
        onCommit(text, { replace: start !== undefined })
        written.current = text
        ownKey.current = entryKey()
    }

    const schedule = (text: string) => {
        cancel()

        if (text !== written.current) {
            waiting.current = window.setTimeout(
                () => write(text),
                text === '' ? 0 : pause,
            )
        }
    }

    return (
        <SearchField
            value={draft}
            onValueChange={(next) => {
                setDraft(next)

                if (!composing.current) {
                    schedule(normalizeSearch(next))
                }
            }}
            placeholder="Search agent, prompt, trace ID…"
            aria-label="Search runs"
            maxLength={maxLength}
            inputRef={inputRef}
            className={className}
            onCompositionStart={() => {
                composing.current = true
                cancel()
            }}
            onCompositionEnd={(event) => {
                composing.current = false
                schedule(normalizeSearch(event.currentTarget.value))
            }}
            onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    write(normalizeSearch(event.currentTarget.value))
                }
            }}
            onBlur={(event) => {
                // Focus moving to the field's own clear button is still the same session.
                if (
                    event.relatedTarget instanceof Node &&
                    event.currentTarget.parentElement?.contains(
                        event.relatedTarget,
                    )
                ) {
                    // A composition does not outlive the focus that was in the input.
                    if (composing.current) {
                        composing.current = false
                        schedule(normalizeSearch(event.currentTarget.value))
                    }

                    return
                }

                composing.current = false
                write(normalizeSearch(event.currentTarget.value))
                session.current = null
            }}
        />
    )
}
