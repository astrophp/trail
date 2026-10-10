import { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

/** One line of the help: what a key does, and the keys. */
export type ShortcutRow = {
    /** Identifies the row; drawn into `data-shortcut`. */
    id: string
    label: string
    /** One key cap per press: a single key has one, a sequence (`g` then `t`) has two. */
    keys: string[]
}

export type ShortcutGroup = {
    id: string
    heading: string
    /** The group applies to the page the person is on: it is marked so. */
    applies?: boolean
    rows: ShortcutRow[]
}

type ShortcutsDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    /** What the dialog is for, under its title. */
    description: string
    /** In the order they are drawn. */
    groups: ShortcutGroup[]
    /** What marks a group that applies to the current page. */
    appliesLabel?: string
    /** What joins the two presses of a sequence. */
    thenLabel?: string
    /**
     * Called as the dialog closes, when focus is to go back to where it was. The dialog has no
     * trigger of its own, so the browser returns it to nothing: the caller puts it back.
     */
    onCloseAutoFocus?: (event: Event) => void
    className?: string
}

/**
 * A dialog that lists keyboard shortcuts in groups: a small muted heading over a list of rows,
 * each the action on the left and its keys, drawn as key caps, on the right. It knows nothing of
 * Trail: the caller supplies the groups, the key names for the platform, and the order.
 *
 * The dialog is marked `data-shortcut-help` so the shortcut that opens it can also close it.
 */
export function ShortcutsDialog({
    open,
    onOpenChange,
    title,
    description,
    groups,
    appliesLabel = 'This page',
    thenLabel = 'then',
    onCloseAutoFocus,
    className,
}: ShortcutsDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                data-shortcut-help=""
                showCloseButton={false}
                onCloseAutoFocus={onCloseAutoFocus}
                className={cn(
                    'max-h-[90svh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-lg',
                    className,
                )}
            >
                <DialogHeader className="px-4 pt-4 pb-3">
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-4">
                    {groups.map((group) => (
                        <div
                            key={group.id}
                            role="group"
                            data-slot="shortcut-group"
                            aria-labelledby={`shortcut-group-${group.id}`}
                        >
                            <h3
                                id={`shortcut-group-${group.id}`}
                                className="mb-1 flex items-center gap-2 text-caption font-medium text-muted-foreground"
                            >
                                {group.heading}
                                {group.applies ? (
                                    <span
                                        data-slot="shortcut-applies"
                                        className="rounded-sm bg-muted px-1.5 py-0.5 text-micro font-normal"
                                    >
                                        {appliesLabel}
                                    </span>
                                ) : null}
                            </h3>
                            <ul className="divide-y divide-border">
                                {group.rows.map((row) => (
                                    <li
                                        key={row.id}
                                        data-shortcut={row.id}
                                        className="flex min-h-10 items-center justify-between gap-4 py-2 text-ui"
                                    >
                                        <span>{row.label}</span>
                                        <KbdGroup className="shrink-0">
                                            {row.keys.map((key, index) => (
                                                <Fragment key={index}>
                                                    {index > 0 ? (
                                                        <span className="text-caption text-muted-foreground">
                                                            {thenLabel}
                                                        </span>
                                                    ) : null}
                                                    <Kbd>{key}</Kbd>
                                                </Fragment>
                                            ))}
                                        </KbdGroup>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
                <DialogFooter className="mx-0 mb-0">
                    <DialogClose asChild>
                        <Button variant="outline">Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
