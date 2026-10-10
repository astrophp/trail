import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react'
import { useLocation } from 'react-router'

/** A name a page gave itself, and the path of the page that gave it. */
type Named = { title: string; pathname: string }

type PageTitle = {
    named: Named | null
    setNamed: (named: Named | null) => void
}

const PageTitleContext = createContext<PageTitle>({
    named: null,
    setNamed: () => {},
})

/**
 * Holds the name the page on screen has given itself. The shell wraps its pages in it and reads
 * the name for the breadcrumb and the browser tab; a page sets it with `usePageTitle`.
 */
export function PageTitleProvider({ children }: { children: ReactNode }) {
    const [named, setNamed] = useState<Named | null>(null)
    const value = useMemo(() => ({ named, setNamed }), [named])

    return <PageTitleContext value={value}>{children}</PageTitleContext>
}

/**
 * The page's own name, or `null` when it has none and its route's title applies. A name only
 * counts at the path it was given for, so it never shows on the page that replaced it.
 */
export function useCurrentPageTitle(): string | null {
    const { named } = useContext(PageTitleContext)
    const { pathname } = useLocation()

    return named !== null && named.pathname === pathname ? named.title : null
}

/**
 * Names the page for the breadcrumb and the browser tab, in place of its route's generic title
 * (a run's page is called after the run). Pass `null` while the name is not known: the route's
 * title shows then. The name is dropped when the page goes away.
 */
export function usePageTitle(title: string | null): void {
    const { setNamed } = useContext(PageTitleContext)
    const { pathname } = useLocation()

    useEffect(() => {
        setNamed(title === null ? null : { title, pathname })

        return () => setNamed(null)
    }, [title, pathname, setNamed])
}
