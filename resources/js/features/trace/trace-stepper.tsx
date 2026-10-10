import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useId, useMemo } from 'react'
import { Link, useNavigate, type To } from 'react-router'
import { readTraceListView, traceListApiParams } from '@/api/trace-list-view'
import type { TraceNeighboursResponse } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import {
    useConversationNeighbours,
    useNeighbours,
} from '@/features/trace/use-neighbours'
import { useShortcuts } from '@/hooks/use-shortcuts'
import { withTurn } from '@/lib/conversation-path'
import { ariaKeyShortcuts, keyCaps, type ShortcutId } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'

type TraceStepperProps = {
    traceId: string
    /** The page the run was opened from, as a `from` value (see `useBackLink`). */
    from: string
    /** What the steps go through: the runs of a list view, or the turns of a conversation. */
    within: 'list' | 'conversation'
    className?: string
}

/** What a step tells the page it opens: it was reached by stepping. */
const stepped = { stepped: true }

type Side = {
    label: string
    /** The shortcut that takes the step: its key is drawn beside the control and exposed on it. */
    shortcut: ShortcutId
    /** Where the step goes; `null` when there is no run to go to. */
    to: To | null
    icon: typeof ChevronLeftIcon
}

/** One step: a real link when there is a run to go to, an inert control that says so when there is not. */
function Step({ label, shortcut, to, icon: Icon }: Side) {
    const hint = keyCaps(shortcut).join(' ')
    const keys = ariaKeyShortcuts(shortcut)

    return (
        <span className="flex items-center gap-1.5">
            {to === null ? (
                <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={label}
                    aria-keyshortcuts={keys}
                    aria-disabled="true"
                    className="pointer-events-none opacity-50"
                >
                    <Icon aria-hidden="true" />
                </Button>
            ) : (
                <Button asChild variant="outline" size="icon-sm">
                    <Link
                        to={to}
                        state={stepped}
                        aria-label={label}
                        aria-keyshortcuts={keys}
                        title={`${label} (${hint})`}
                    >
                        <Icon aria-hidden="true" />
                    </Link>
                </Button>
            )}
            <Kbd aria-hidden="true">{hint}</Kbd>
        </span>
    )
}

type StepsProps = {
    traceId: string
    /** The `from` value the run at the end of a step is opened with. */
    fromFor: (id: string) => string
    neighbours: { data: TraceNeighboursResponse | undefined; isError: boolean }
    words: {
        group: string
        previous: string
        next: string
        /** Said when the run has no neighbour on either side. */
        alone: string
        /** Said when the neighbours could not be loaded. */
        failed: string
    }
    className?: string
}

/**
 * The two steps and the line that says when there is nothing to step to. A step opens that run
 * with `fromFor` as its way back and nothing else of this page's state, adds a history entry, and
 * asks the new page to take focus. A side without a neighbour is inert, as are both while the
 * answer is loading; when neither neighbour exists, or they could not be loaded, a line beside
 * the steps says so.
 */
function Steps({
    traceId,
    fromFor,
    neighbours: { data, isError },
    words,
    className,
}: StepsProps) {
    const navigate = useNavigate()
    const noteId = useId()
    const previous = data?.data.previous ?? null
    const next = data?.data.next ?? null
    const note = isError
        ? words.failed
        : data !== undefined && previous === null && next === null
          ? words.alone
          : null

    function target(id: string | null): To | null {
        // A step to the run already shown goes nowhere.
        return id === null || id === traceId
            ? null
            : {
                  pathname: `/traces/${encodeURIComponent(id)}`,
                  search: `?${new URLSearchParams({ from: fromFor(id) }).toString()}`,
              }
    }

    const back = target(previous)
    const forward = target(next)

    // The new page takes focus once it has loaded (see `useFocusAfterStep`).
    const go = (to: To | null) =>
        to === null ? undefined : () => void navigate(to, { state: stepped })

    useShortcuts({
        'trace-previous': go(back),
        'trace-next': go(forward),
    })

    return (
        <div
            role="group"
            aria-label={words.group}
            aria-describedby={note === null ? undefined : noteId}
            data-slot="trace-stepper"
            className={cn(
                'flex flex-wrap items-center gap-x-4 gap-y-2',
                className,
            )}
        >
            {note === null ? null : (
                <p id={noteId} className="text-caption text-muted-foreground">
                    {note}
                </p>
            )}
            <Step
                label={words.previous}
                shortcut="trace-previous"
                to={back}
                icon={ChevronLeftIcon}
            />
            <Step
                label={words.next}
                shortcut="trace-next"
                to={forward}
                icon={ChevronRightIcon}
            />
        </div>
    )
}

const listWords = {
    group: 'Step through the list',
    previous: 'Previous trace',
    next: 'Next trace',
    alone: 'No other run before or after this one in the list it was opened from.',
    failed: 'Previous and next could not be loaded.',
}

const conversationWords = {
    group: 'Step through the conversation',
    previous: 'Previous turn',
    next: 'Next turn',
    alone: 'No other turn before or after this one in the conversation.',
    failed: 'Previous and next turn could not be loaded.',
}

/** Previous and next run in the list view the run was opened from; the run opened has the same list context. */
function ListStepper({
    traceId,
    from,
    className,
}: Omit<TraceStepperProps, 'within'>) {
    const params = useMemo(() => {
        const query = new URLSearchParams(new URL(from, 'http://x').search)

        return traceListApiParams(readTraceListView(query))
    }, [from])

    const neighbours = useNeighbours(traceId, params)

    return (
        <Steps
            traceId={traceId}
            fromFor={() => from}
            neighbours={neighbours}
            words={listWords}
            className={className}
        />
    )
}

/**
 * Previous and next turn of the conversation the run was opened from. The run stepped to is
 * opened with the conversation as its way back, at the turn being looked at: the `turn` of the
 * way back is rewritten, so "Back to conversation" returns to where the reader is.
 */
function ConversationStepper({
    traceId,
    from,
    className,
}: Omit<TraceStepperProps, 'within'>) {
    const neighbours = useConversationNeighbours(traceId)

    return (
        <Steps
            traceId={traceId}
            fromFor={(id) => withTurn(from, id)}
            neighbours={neighbours}
            words={conversationWords}
            className={className}
        />
    )
}

/**
 * Previous and next run in the page the run was opened from (`k` and `j` are the shortcuts):
 * the runs of a list view, or the turns of a conversation. The list context is kept from step to
 * step and nothing else of this page's state is.
 */
export function TraceStepper({ within, ...props }: TraceStepperProps) {
    return within === 'conversation' ? (
        <ConversationStepper {...props} />
    ) : (
        <ListStepper {...props} />
    )
}
