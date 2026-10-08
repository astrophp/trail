import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useId, useMemo } from 'react'
import { Link, useNavigate, type To } from 'react-router'
import { readTraceListView, traceListApiParams } from '@/api/trace-list-view'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { useNeighbours } from '@/features/trace/use-neighbours'
import { useShortcuts } from '@/hooks/use-shortcuts'
import { cn } from '@/lib/utils'

type TraceStepperProps = {
    traceId: string
    /** The list view the run was opened from, as a `from` value (see `useBackLink`). */
    from: string
    className?: string
}

/** What a step tells the page it opens: it was reached by stepping. */
const stepped = { stepped: true }

type Side = {
    label: string
    hint: string
    /** Where the step goes; `null` when there is no run to go to. */
    to: To | null
    icon: typeof ChevronLeftIcon
}

/** One step: a real link when there is a run to go to, an inert control that says so when there is not. */
function Step({ label, hint, to, icon: Icon }: Side) {
    return (
        <span className="flex items-center gap-1.5">
            {to === null ? (
                <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={label}
                    aria-keyshortcuts={hint}
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
                        aria-keyshortcuts={hint}
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

/**
 * Previous and next run in the list view the run was opened from, with `k` and `j` as shortcuts.
 * A step opens that run with the same list context and nothing else of this page's state, adds a
 * history entry, and asks the new page to take focus. A side without a neighbour is inert, as
 * are both while the answer is loading; when neither neighbour exists, or they could not be
 * loaded, a line beside the steps says so.
 */
export function TraceStepper({ traceId, from, className }: TraceStepperProps) {
    const navigate = useNavigate()
    const noteId = useId()
    const params = useMemo(() => {
        const query = new URLSearchParams(new URL(from, 'http://x').search)

        return traceListApiParams(readTraceListView(query))
    }, [from])
    const { data, isError } = useNeighbours(traceId, params)
    const previous = data?.data.previous ?? null
    const next = data?.data.next ?? null
    const note = isError
        ? 'Previous and next could not be loaded.'
        : data !== undefined && previous === null && next === null
          ? 'No other run before or after this one in the list it was opened from.'
          : null

    function target(id: string | null): To | null {
        // A step to the run already shown goes nowhere.
        return id === null || id === traceId
            ? null
            : {
                  pathname: `/traces/${encodeURIComponent(id)}`,
                  search: `?${new URLSearchParams({ from }).toString()}`,
              }
    }

    const back = target(previous)
    const forward = target(next)

    // The new page takes focus once it has loaded (see `useFocusAfterStep`).
    const go = (to: To | null) =>
        to === null ? undefined : () => void navigate(to, { state: stepped })

    useShortcuts({ k: go(back), j: go(forward) })

    return (
        <div
            role="group"
            aria-label="Step through the list"
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
                label="Previous trace"
                hint="k"
                to={back}
                icon={ChevronLeftIcon}
            />
            <Step
                label="Next trace"
                hint="j"
                to={forward}
                icon={ChevronRightIcon}
            />
        </div>
    )
}
