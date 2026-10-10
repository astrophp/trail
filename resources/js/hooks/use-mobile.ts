import { useSyncExternalStore } from 'react'

// The width below which the sidebar is a drawer. Must match --breakpoint-md (961px) in index.css.
const MOBILE_BREAKPOINT = 961

const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
    const mql = window.matchMedia(query)

    mql.addEventListener('change', onChange)

    return () => mql.removeEventListener('change', onChange)
}

export function useIsMobile() {
    return useSyncExternalStore(
        subscribe,
        () => window.innerWidth < MOBILE_BREAKPOINT,
    )
}
