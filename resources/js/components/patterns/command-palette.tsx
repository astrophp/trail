import {
    createContext,
    useContext,
    useEffect,
    useRef,
    type ComponentProps,
} from 'react'
import { Link } from 'react-router'
import {
    Command,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

const PaletteContext = createContext<{
    value: string
    onValueChange: (value: string) => void
} | null>(null)

type CommandPaletteProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** The text in the search row. */
    value: string
    onValueChange: (value: string) => void
    /** The dialog's name, announced when it opens. Not drawn. */
    title: string
    /** What the dialog is for, announced after its name. Not drawn. */
    description: string
    /** The name of the search row, which cmdk takes from here and not from the input's own label. Not drawn. */
    label: string
    /**
     * Called as the dialog closes, when focus is to go back to where it was. The dialog has no
     * trigger of its own, so the browser returns it to nothing: the caller puts it back.
     */
    onCloseAutoFocus?: (event: Event) => void
    className?: string
    /** A `CommandPaletteInput`, a `CommandPaletteList`, a `CommandPaletteStatus` and a `CommandPaletteFooter`. */
    children: React.ReactNode
}

/**
 * A command palette: a dialog near the top of the page holding a search row, a scrolling list in
 * groups, a status line and a footer of key hints. It knows nothing of what the list holds and
 * does not filter it: whoever fills the list decides which items match the text.
 *
 * The keys are cmdk's: the arrows move the active option, Enter chooses it, Escape closes the
 * dialog. On top of that, Enter with Control or Command held opens the active option's link in a
 * new tab, as a click with that key would.
 */
export function CommandPalette({
    open,
    onOpenChange,
    value,
    onValueChange,
    title,
    description,
    label,
    onCloseAutoFocus,
    className,
    children,
}: CommandPaletteProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                data-palette=""
                showCloseButton={false}
                onCloseAutoFocus={onCloseAutoFocus}
                className={cn(
                    'top-16 translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl',
                    className,
                )}
            >
                <DialogHeader className="sr-only">
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <PaletteContext value={{ value, onValueChange }}>
                    <PaletteCommand label={label}>{children}</PaletteCommand>
                </PaletteContext>
            </DialogContent>
        </Dialog>
    )
}

/**
 * cmdk marks the active option with `aria-selected` at once, but only writes its id to the search
 * row's `aria-activedescendant` after the first arrow key, so a screen reader is told nothing
 * about the option that is active when the dialog opens. This keeps the attribute in step with
 * the option that is marked, from the start; cmdk writes the same id when it does catch up.
 */
function useActiveDescendant(root: React.RefObject<HTMLDivElement | null>) {
    useEffect(() => {
        const element = root.current

        if (element === null) {
            return
        }

        const sync = () => {
            const input = element.querySelector('[cmdk-input]')
            const id = element.querySelector(
                '[cmdk-item][aria-selected="true"]',
            )?.id

            if (id === undefined || id === '') {
                input?.removeAttribute('aria-activedescendant')
            } else if (input?.getAttribute('aria-activedescendant') !== id) {
                input?.setAttribute('aria-activedescendant', id)
            }
        }
        const observer = new MutationObserver(sync)

        sync()
        observer.observe(element, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['aria-selected'],
        })

        return () => observer.disconnect()
    }, [root])
}

/** The command list itself, inside the dialog's content so it exists only while the dialog is open. */
function PaletteCommand({
    label,
    children,
}: {
    label: string
    children: React.ReactNode
}) {
    const root = useRef<HTMLDivElement>(null)

    useActiveDescendant(root)

    return (
        <Command
            ref={root}
            label={label}
            shouldFilter={false}
            loop
            className="rounded-none! p-0"
            onKeyDown={openInNewTab}
        >
            {children}
        </Command>
    )
}

/** Enter with Control or Command held: the active option's link in a new tab, and nothing else happens. */
function openInNewTab(event: React.KeyboardEvent<HTMLElement>) {
    if (
        event.key !== 'Enter' ||
        !(event.metaKey || event.ctrlKey) ||
        event.nativeEvent.isComposing
    ) {
        return
    }

    const link = event.currentTarget.querySelector<HTMLAnchorElement>(
        '[cmdk-item][aria-selected="true"] a[href]',
    )

    if (link !== null) {
        event.preventDefault()
        window.open(link.href, '_blank', 'noopener')
    }
}

/** The search row: the text field with a search icon, and the key that closes the dialog on its right. */
export function CommandPaletteInput({
    className,
    ...props
}: Omit<ComponentProps<typeof CommandInput>, 'value' | 'onValueChange'>) {
    const palette = useContext(PaletteContext)

    if (palette === null) {
        throw new Error('CommandPaletteInput must be used in a CommandPalette.')
    }

    return (
        <div
            data-slot="command-palette-input"
            className="relative border-b pb-1"
        >
            <CommandInput
                {...props}
                value={palette.value}
                onValueChange={palette.onValueChange}
                className={cn('pr-12 text-base md:text-ui', className)}
            />
            <Kbd
                aria-hidden="true"
                className="absolute top-5 right-3 -translate-y-1/2"
            >
                esc
            </Kbd>
        </div>
    )
}

/** The scrolling results, a listbox: cut to a height and scrolled beyond it. */
export function CommandPaletteList({
    className,
    ...props
}: ComponentProps<typeof CommandList>) {
    return (
        <CommandList
            data-slot="command-palette-list"
            className={cn('max-h-104 p-1', className)}
            {...props}
        />
    )
}

/** A titled group of options, its heading small and muted. */
export function CommandPaletteGroup({
    className,
    ...props
}: ComponentProps<typeof CommandGroup>) {
    return (
        <CommandGroup
            data-slot="command-palette-group"
            className={cn('p-0', className)}
            {...props}
        />
    )
}

/**
 * One option. It carries no padding of its own: its content, a `CommandPaletteRow` or a
 * `CommandPaletteLink` around one, fills it.
 */
export function CommandPaletteItem({
    className,
    ...props
}: ComponentProps<typeof CommandItem>) {
    return (
        <CommandItem
            data-slot="command-palette-item"
            className={cn('p-0 [&>svg]:hidden', className)}
            {...props}
        />
    )
}

type CommandPaletteRowProps = {
    /** The icon, or the status mark, at the start. */
    icon?: React.ReactNode
    /** Small muted text at the end: the short id, or the kind of thing. */
    meta?: React.ReactNode
    className?: string
    /** The label: cut to one line. */
    children: React.ReactNode
}

/** The look of an option: an icon, a label cut to one line, and muted meta text at the end. */
export function CommandPaletteRow({
    icon,
    meta,
    className,
    children,
}: CommandPaletteRowProps) {
    return (
        <span
            data-slot="command-palette-row"
            className={cn(
                'flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5',
                className,
            )}
        >
            {icon}
            <span className="min-w-0 flex-1 truncate">{children}</span>
            {meta === undefined ? null : (
                <span className="ml-auto flex shrink-0 items-center gap-2 text-caption text-muted-foreground">
                    {meta}
                </span>
            )}
        </span>
    )
}

/**
 * Makes an option a real link: the address is in the page, so Enter, a click, a middle-click and
 * "open in new tab" do what they do on any link. It fills the option, and stays out of the Tab
 * order (focus stays in the search row). `onFollow` is called when a plain click follows the
 * link, so the dialog can close; a click with a modifier key opens elsewhere and leaves it open.
 */
export function CommandPaletteLink({
    onFollow,
    onClick,
    className,
    ...props
}: ComponentProps<typeof Link> & { onFollow?: () => void }) {
    return (
        <Link
            data-slot="command-palette-link"
            tabIndex={-1}
            className={cn('flex min-w-0 flex-1 outline-none', className)}
            onClick={(event) => {
                // The option is chosen by the link; its own click must not choose it a second time.
                event.stopPropagation()
                onClick?.(event)

                if (
                    !event.defaultPrevented &&
                    event.button === 0 &&
                    !(
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                    )
                ) {
                    onFollow?.()
                }
            }}
            {...props}
        />
    )
}

type CommandPaletteStatusProps = {
    /**
     * What the search is doing, as a sentence. The one live region of the palette: it announces
     * each new sentence once, so give it a sentence that is new for a new answer.
     */
    children?: React.ReactNode
    /** Spoken only: the sentence is not drawn (a count of results the list already shows). */
    spokenOnly?: boolean
    /** Something to do about the state, such as a button to try again. */
    action?: React.ReactNode
    className?: string
}

/** A line between the list and the footer that says what the search is doing, aloud and on screen. */
export function CommandPaletteStatus({
    children,
    spokenOnly = false,
    action,
    className,
}: CommandPaletteStatusProps) {
    const drawn = !spokenOnly && children !== undefined && children !== null

    return (
        <div
            data-slot="command-palette-status"
            className={cn(
                drawn
                    ? 'flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2.5 text-ui text-muted-foreground'
                    : 'sr-only',
                className,
            )}
        >
            <p role="status">{children}</p>
            {drawn ? action : null}
        </div>
    )
}

/** The foot of the dialog: key hints and a line of small muted text. */
export function CommandPaletteFooter({
    className,
    ...props
}: ComponentProps<'div'>) {
    return (
        <div
            data-slot="command-palette-footer"
            className={cn(
                'flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-caption text-muted-foreground',
                className,
            )}
            {...props}
        />
    )
}

/** One key hint: the keys, then what they do (`↑ ↓` navigate). */
export function CommandPaletteHint({
    keys,
    className,
    children,
}: {
    keys: string[]
    className?: string
    children: React.ReactNode
}) {
    return (
        <span
            data-slot="command-palette-hint"
            className={cn('inline-flex items-center gap-1.5', className)}
        >
            <KbdGroup>
                {keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                ))}
            </KbdGroup>
            {children}
        </span>
    )
}
