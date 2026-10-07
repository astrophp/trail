import { SearchIcon, XIcon } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

type SearchFieldProps = {
    value: string
    onValueChange: (value: string) => void
    placeholder?: string
    'aria-label': string
    /** The key that focuses the field, shown while it is empty: `/`. The caller binds the key. */
    shortcutHint?: string
    className?: string
}

/** A text search. Controlled and not debounced: the caller decides when the value is acted on. */
export function SearchField({
    value,
    onValueChange,
    placeholder,
    'aria-label': ariaLabel,
    shortcutHint,
    className,
}: SearchFieldProps) {
    const input = useRef<HTMLInputElement>(null)

    return (
        <div
            data-slot="search-field"
            className={cn('relative w-full md:w-66.25', className)}
        >
            <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-3.75 -translate-y-1/2 text-faint"
            />
            <Input
                ref={input}
                type="search"
                value={value}
                placeholder={placeholder}
                aria-label={ariaLabel}
                aria-keyshortcuts={shortcutHint}
                onChange={(event) => onValueChange(event.target.value)}
                className="h-8.5 pr-9 pl-8.5 text-base md:text-ui [&::-webkit-search-cancel-button]:appearance-none"
            />
            {value ? (
                <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Clear search"
                    className="absolute top-1/2 right-1.5 -translate-y-1/2"
                    onClick={() => {
                        onValueChange('')
                        input.current?.focus()
                    }}
                >
                    <XIcon aria-hidden="true" />
                </Button>
            ) : shortcutHint ? (
                <Kbd
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2"
                >
                    {shortcutHint}
                </Kbd>
            ) : null}
        </div>
    )
}
