import { useState } from 'react'
import { type ActivityMode } from '@/components/telemetry/activity-mode'
import { ActivityModeSwitch } from '@/components/telemetry/activity-mode-switch'
import type { CatalogueEntry } from '@/catalogue/types'

function Switch() {
    const [mode, setMode] = useState<ActivityMode>('volume')

    return <ActivityModeSwitch value={mode} onValueChange={setMode} />
}

export const catalogue: CatalogueEntry = {
    title: 'Activity mode switch',
    specimens: [{ name: 'One choice always on', Component: Switch }],
}
