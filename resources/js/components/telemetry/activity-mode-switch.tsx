import { ViewSwitch } from '@/components/patterns/view-switch'
import {
    activityModeLabels,
    activityModes,
    type ActivityMode,
} from '@/components/telemetry/activity-mode'

const options = activityModes.map((mode) => ({
    value: mode,
    label: activityModeLabels[mode],
}))

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
        <ViewSwitch
            label="Chart shows"
            options={options}
            value={value}
            onValueChange={onValueChange}
            className={className}
        />
    )
}
