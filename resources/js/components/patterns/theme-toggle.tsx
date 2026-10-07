import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme, type Theme } from '@/hooks/use-theme'

const labels: Record<Theme, string> = {
    light: 'Light',
    dark: 'Dark',
    system: 'System',
}

export function ThemeToggle({ className }: { className?: string }) {
    const { theme, setTheme } = useTheme()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Theme: ${labels[theme]}`}
                    className={className}
                >
                    <SunIcon className="dark:hidden" />
                    <MoonIcon className="hidden dark:block" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                    value={theme}
                    onValueChange={(value) => setTheme(value as Theme)}
                >
                    <DropdownMenuRadioItem value="light">
                        <SunIcon /> Light
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">
                        <MoonIcon /> Dark
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">
                        <MonitorIcon /> System
                    </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
