import { ThemeProvider } from '@/app/providers/theme-provider'
import { ThemeToggle } from '@/components/patterns/theme-toggle'
import { Button } from '@/components/ui/button'

export function App() {
    return (
        <ThemeProvider>
            <main className="flex items-center gap-4 p-6">
                <h1 className="text-title">Trail</h1>
                <Button>Button</Button>
                <ThemeToggle />
            </main>
        </ThemeProvider>
    )
}
