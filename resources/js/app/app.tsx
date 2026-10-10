import { BrowserRouter, Route, Routes } from 'react-router'
import { QueryProvider } from '@/app/providers/query-provider'
import { AppShell } from '@/app/shell/app-shell'
import { ThemeProvider } from '@/app/providers/theme-provider'
import { notFoundRoute, routeTable } from '@/app/routes'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BootContext } from '@/hooks/use-boot'
import { routerBasename } from '@/lib/base-path'
import type { Boot } from '@/lib/boot'
import type { QueryClient } from '@tanstack/react-query'

export function App({
    boot,
    queryClient,
}: {
    boot: Boot
    /** A client of the caller's own (tests); the dashboard's defaults otherwise. */
    queryClient?: QueryClient
}) {
    return (
        <BootContext value={boot}>
            <QueryProvider client={queryClient}>
                <ThemeProvider>
                    <TooltipProvider>
                        {/* At the top, so a toast never covers the pagination at the foot of a page. */}
                        <Toaster
                            position="top-center"
                            offset="4rem"
                            mobileOffset="4rem"
                        />
                        {/*
                            A location change is rendered at once, everywhere, instead of in a React transition: the
                            page never shows a URL that the screen has not caught up with (a busy page used to show
                            the old tab or span after the address had changed). The price is that a heavy page
                            blocks input while it renders a change, instead of staying responsive on its old state.
                            Nothing writes the URL per keystroke (the list's search waits 300 ms, or Enter or
                            blur), so this does not multiply renders.
                        */}
                        <BrowserRouter
                            basename={routerBasename(boot.path)}
                            useTransitions={false}
                        >
                            <Routes>
                                <Route element={<AppShell />}>
                                    {routeTable.map(({ path, element }) => (
                                        <Route
                                            key={path}
                                            path={path}
                                            element={element}
                                        />
                                    ))}
                                    <Route
                                        path="*"
                                        element={notFoundRoute.element}
                                    />
                                </Route>
                            </Routes>
                        </BrowserRouter>
                    </TooltipProvider>
                </ThemeProvider>
            </QueryProvider>
        </BootContext>
    )
}
