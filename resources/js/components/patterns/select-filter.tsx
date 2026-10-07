import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type SelectFilterOption = { value: string; label: string }

/** The look of a filter's trigger, shared by the selects that sit in a filter row. */
export const filterTriggerClass = 'text-xs data-[size=default]:h-8.5 md:text-xs'

/** Stands for "all": Radix Select does not allow an empty item value. */
const all = '__all__'

type SelectFilterProps = {
    /** The chosen option's value, or `null` for "all". */
    value: string | null
    onValueChange: (value: string | null) => void
    options: SelectFilterOption[]
    /** How "no filter" reads in the list and on the trigger: `All agents`. */
    allLabel: string
    'aria-label': string
    className?: string
}

/**
 * A filter that picks one of a list of options, or none of them (`null`: all). A value that
 * is not among the options (a link from elsewhere, options still loading) is shown as it is.
 */
export function SelectFilter({
    value,
    onValueChange,
    options,
    allLabel,
    'aria-label': ariaLabel,
    className,
}: SelectFilterProps) {
    const unlisted =
        value !== null && !options.some((option) => option.value === value)
            ? value
            : null

    return (
        <Select
            value={value ?? all}
            onValueChange={(next) => onValueChange(next === all ? null : next)}
        >
            <SelectTrigger
                aria-label={ariaLabel}
                data-slot="select-filter"
                className={cn(filterTriggerClass, className)}
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
                <SelectItem value={all}>{allLabel}</SelectItem>
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
                {unlisted !== null ? (
                    <SelectItem value={unlisted}>{unlisted}</SelectItem>
                ) : null}
            </SelectContent>
        </Select>
    )
}
