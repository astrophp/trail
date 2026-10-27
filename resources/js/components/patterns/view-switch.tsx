import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export type ViewOption<T extends string> = {
    value: T
    label: string
    /** A word on hover, such as what the choice applies to. */
    title?: string
}

type ViewSwitchProps<T extends string> = {
    /** What the switch chooses for; it is read out as `<label>` (`turn 1 response view`). */
    label: string
    options: readonly ViewOption<T>[]
    value: T
    onValueChange: (value: T) => void
    className?: string
}

/**
 * The one control for how something is shown (Tree or Raw, Rendered or Raw, Volume, Duration or
 * Cost): a row of outlined toggles, one always on. Pressing the one that is on changes nothing.
 */
export function ViewSwitch<T extends string>({
    label,
    options,
    value,
    onValueChange,
    className,
}: ViewSwitchProps<T>) {
    return (
        <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            aria-label={label}
            value={value}
            onValueChange={(next) => {
                // Pressing the one that is on reports an empty value.
                const chosen = options.find((option) => option.value === next)

                if (chosen !== undefined) {
                    onValueChange(chosen.value)
                }
            }}
            className={className}
        >
            {options.map((option) => (
                <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    title={option.title}
                >
                    {option.label}
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    )
}
