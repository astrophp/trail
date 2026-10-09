import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
    activityModeLabels,
    activityModes,
    type ActivityMode,
} from '@/components/telemetry/activity-mode'

type ActivityModeSwitchProps = {
    value: ActivityMode
    onValueChange: (value: ActivityMode) => void
    className?: string
}

/** Picks what the activity chart shows. One choice is always on: pressing it again changes nothing. */
export function ActivityModeSwitch({
    value,
    onValueChange,
    className,
}: ActivityModeSwitchProps) {
    return (
        <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Chart shows"
            value={value}
            onValueChange={(next) => {
                // Pressing the one that is on reports an empty value.
                const mode = activityModes.find((one) => one === next)

                if (mode !== undefined) {
                    onValueChange(mode)
                }
            }}
            className={className}
        >
            {activityModes.map((mode) => (
                <ToggleGroupItem key={mode} value={mode}>
                    {activityModeLabels[mode]}
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    )
}
