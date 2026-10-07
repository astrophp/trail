import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell } from '@/app/shell/app-shell'
import { ThemeProvider } from '@/app/providers/theme-provider'
import { notFoundRoute, routeTable } from '@/app/routes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BootContext } from '@/hooks/use-boot'
import { routerBasename } from '@/lib/base-path'
import type { Boot } from '@/lib/boot'

export function App({ boot }: { boot: Boot }) {
    return (
        <BootContext value={boot}>
            <ThemeProvider>
                <TooltipProvider>
                    <BrowserRouter basename={routerBasename(boot.path)}>
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
        </BootContext>
    )
}
