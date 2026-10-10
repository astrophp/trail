import { SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { usePalette } from '@/features/palette/palette-context'
import { ariaKeyShortcuts, keyCaps } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'

/**
 * The button that opens the palette, for people who do not know the shortcut. It reads as a
 * search field with the shortcut written on it; on a narrow screen it is an icon button with the
 * same name.
 */
export function PaletteTrigger({ className }: { className?: string }) {
    const { show, open } = usePalette()

    return (
        <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Search"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-keyshortcuts={ariaKeyShortcuts('palette')}
            onClick={(event) => show(event.currentTarget)}
            className={cn(
                'text-muted-foreground hover:text-foreground focus-visible:text-foreground md:w-44 md:justify-start md:px-2.5 md:font-normal',
                className,
            )}
        >
            <SearchIcon aria-hidden="true" />
            <span aria-hidden="true" className="hidden md:inline">
                Search…
            </span>
            <Kbd aria-hidden="true" className="ml-auto hidden md:inline-flex">
                {keyCaps('palette')[0]}
            </Kbd>
        </Button>
    )
}
