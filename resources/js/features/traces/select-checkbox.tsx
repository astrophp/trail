import { useCallback } from 'react'
import { cn } from '@/lib/utils'

type SelectCheckboxProps = {
    checked: boolean
    /** Some, not all, of what it stands for is selected. */
    indeterminate?: boolean
    /** Its accessible name: there is no visible text. */
    label: string
    /** Acts on nothing, as the bookmark toggle does: it stays focusable and says it is disabled. */
    disabled?: boolean
    onChange: () => void
    className?: string
}

/**
 * A native checkbox for a table cell: Space, the label and the accessible states come with it.
 * Its label is a larger target than the box and sits above a stretched row link, so a press
 * selects and never opens the row.
 */
export function SelectCheckbox({
    checked,
    indeterminate = false,
    label,
    disabled = false,
    onChange,
    className,
}: SelectCheckboxProps) {
    // `indeterminate` is a property, not an attribute: it is set on the element itself.
    const setIndeterminate = useCallback(
        (input: HTMLInputElement | null) => {
            if (input) {
                input.indeterminate = indeterminate
            }
        },
        [indeterminate],
    )

    return (
        <label
            className={cn(
                'relative z-1 -m-3 flex w-fit cursor-pointer items-center p-3',
                disabled && 'cursor-default opacity-50',
                className,
            )}
        >
            <input
                ref={setIndeterminate}
                type="checkbox"
                checked={checked}
                aria-label={label}
                aria-disabled={disabled || undefined}
                onChange={() => {
                    if (!disabled) {
                        onChange()
                    }
                }}
                className="size-4 cursor-[inherit] accent-primary"
            />
        </label>
    )
}
