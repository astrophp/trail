import { XIcon } from 'lucide-react'
import { useEffect, useRef, type RefObject } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type FilterChip = {
    key: string
    label: string
    onRemove: () => void
}

type FilterChipsProps = {
    chips: FilterChip[]
    onClearAll: () => void
    /**
     * Where keyboard focus goes when no chip is left: the chips take their own controls with
     * them, so the caller says where focus continues (for example the search field).
     */
    focusWhenEmpty: RefObject<HTMLElement | null>
    className?: string
}

/** What to do once the parent has really removed `gone`: focus `next`'s button, or `focusWhenEmpty`. */
type Pending = { gone: string[]; next: string | null; keys: string }

/** The filters that are on, each removable, and a way to clear them all. Nothing is shown when there are none. */
export function FilterChips({
    chips,
    onClearAll,
    focusWhenEmpty,
    className,
}: FilterChipsProps) {
    const buttons = useRef(new Map<string, HTMLButtonElement>())
    const pending = useRef<Pending | null>(null)

    // After every render: carry out a pending focus move once the removed chips are gone. If the
    // chips changed some other way, the pending move is stale and is dropped.
    useEffect(() => {
        const wanted = pending.current

        if (!wanted) {
            return
        }

        const keys = chips.map((chip) => chip.key)

        if (keys.some((key) => wanted.gone.includes(key))) {
            if (keys.join('\n') !== wanted.keys) {
                pending.current = null
            }

            return
        }

        pending.current = null

        if (wanted.next === null) {
            focusWhenEmpty.current?.focus()
        } else {
            buttons.current.get(wanted.next)?.focus()
        }
    })

    if (chips.length === 0) {
        return null
    }

    const keys = chips.map((chip) => chip.key).join('\n')

    const remove = (index: number) => {
        const neighbour = chips[index + 1] ?? chips[index - 1]

        pending.current = {
            gone: [chips[index].key],
            next: neighbour?.key ?? null,
            keys,
        }
        chips[index].onRemove()
    }

    return (
        <div
            data-slot="filter-chips"
            className={cn('flex flex-wrap items-center gap-2', className)}
        >
            <ul aria-label="Active filters" className="flex flex-wrap gap-2">
                {chips.map((chip, index) => (
                    <li key={chip.key}>
                        <Badge
                            variant="outline"
                            className="h-6.5 gap-1 rounded-sm bg-muted py-0 pr-px pl-2 text-caption font-normal text-muted-foreground"
                        >
                            {chip.label}
                            <Button
                                ref={(button) => {
                                    if (button) {
                                        buttons.current.set(chip.key, button)
                                    } else {
                                        buttons.current.delete(chip.key)
                                    }
                                }}
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Remove filter: ${chip.label}`}
                                className="size-6 rounded-sm text-muted-foreground"
                                onClick={() => remove(index)}
                            >
                                <XIcon aria-hidden="true" className="size-3" />
                            </Button>
                        </Badge>
                    </li>
                ))}
            </ul>
            <Button
                variant="ghost"
                size="xs"
                className="text-caption text-muted-foreground"
                onClick={() => {
                    pending.current = {
                        gone: chips.map((chip) => chip.key),
                        next: null,
                        keys,
                    }
                    onClearAll()
                }}
            >
                Clear all
            </Button>
        </div>
    )
}
