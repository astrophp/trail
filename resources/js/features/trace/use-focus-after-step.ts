import { useEffect, useState } from 'react'
import { NavigationType, useLocation, useNavigationType } from 'react-router'
import { focusPageHeading } from '@/lib/focus-page-heading'

/**
 * After a step to another run (see `TraceStepper`), moves focus to the page heading once the run
 * has loaded: the step's own control is gone with the page that had it. Call it where the loaded
 * run is mounted. An ordinary load, Back or Forward never moves focus.
 */
export function useFocusAfterStep(): void {
    const location = useLocation()
    const type = useNavigationType()
    const [stepped] = useState(
        () =>
            type === NavigationType.Push &&
            (location.state as { stepped?: boolean } | null)?.stepped === true,
    )

    useEffect(() => {
        if (stepped) {
            focusPageHeading()
        }
    }, [stepped])
}
