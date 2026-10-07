import { CalendarIcon } from 'lucide-react'
import { filterTriggerClass } from '@/components/patterns/select-filter'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
    timeRangeLabels,
    timeRangePresets,
    type TimeRangePreset,
} from '@/lib/time-range'

type TimeRangeSelectProps = {
    value: TimeRangePreset
    onValueChange: (value: TimeRangePreset) => void
    className?: string
}

/** The window of time a page looks at: the last hour, day or week. */
export function TimeRangeSelect({
    value,
    onValueChange,
    className,
}: TimeRangeSelectProps) {
    return (
        <Select
            value={value}
            // Radix only emits the values of the items below.
            onValueChange={(next) => onValueChange(next as TimeRangePreset)}
        >
            <SelectTrigger
                aria-label="Time range"
                data-slot="time-range-select"
                className={cn(filterTriggerClass, className)}
            >
                <CalendarIcon
                    aria-hidden="true"
                    className="size-3.5 text-muted-foreground"
                />
                <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
                {timeRangePresets.map((preset) => (
                    <SelectItem key={preset} value={preset}>
                        {timeRangeLabels[preset]}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
