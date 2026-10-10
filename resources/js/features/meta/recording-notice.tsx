import { useEffect, useRef, useState } from 'react'
import { Notice } from '@/components/patterns/notice'
import { Code } from '@/components/patterns/code'
import { useMeta } from '@/features/meta/use-meta'
import { focusPageHeading } from '@/lib/focus-page-heading'
import { readStored, removeStored, writeStored } from '@/lib/storage'

/** Set while the person has dismissed the notice in this browser session. */
const dismissedKey = 'trail.recording-notice.dismissed'

const isDismissed = () => readStored(dismissedKey, 'session') === '1'

/**
 * Says recording is paused, on every page, for as long as it is. Dismissing it lasts for the
 * browser session only. It comes back when recording is paused again after it was seen enabled:
 * seeing it enabled forgets the dismissal. An unknown state (`null`) shows nothing.
 */
export function RecordingNotice() {
    const recording = useMeta().data?.data.recording
    const [seen, setSeen] = useState(recording)
    const [dismissed, setDismissed] = useState(
        () => recording !== 'enabled' && isDismissed(),
    )

    // Changed since the last render: forget a dismissal once recording is seen enabled.
    if (seen !== recording) {
        setSeen(recording)

        if (recording === 'enabled') {
            setDismissed(false)
        }
    }

    // The dismiss button is the thing that vanishes: focus goes to the page heading, not the body.
    const dismissing = useRef(false)

    useEffect(() => {
        if (dismissed && dismissing.current) {
            dismissing.current = false
            focusPageHeading()
        }
    }, [dismissed])

    useEffect(() => {
        if (recording === 'enabled') {
            removeStored(dismissedKey, 'session')
        }
    }, [recording])

    if (recording !== 'paused' || dismissed) {
        return null
    }

    return (
        <Notice
            tone="warning"
            title="Recording is paused"
            className="mb-4"
            onDismiss={() => {
                writeStored(dismissedKey, '1', 'session')
                dismissing.current = true
                setDismissed(true)
            }}
        >
            Nothing new is being recorded, and runs that have already been
            recorded stay here. To record again, run{' '}
            <Code>php artisan trail:resume</Code>.
        </Notice>
    )
}
