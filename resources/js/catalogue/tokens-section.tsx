import { ActivityIcon, SearchIcon, SettingsIcon } from 'lucide-react'
import { colorTokens, textPairs } from '@/catalogue/tokens'
import { ThemePair } from '@/catalogue/theme-pair'

// Whole class names, so Tailwind finds them in this file.
const typeScale = [
    { name: 'text-title', note: '27px, page titles' },
    { name: 'text-heading', note: '16px, section headings' },
    { name: 'text-sm', note: '14px, body' },
    { name: 'text-ui', note: '13px, navigation and inputs' },
    { name: 'text-xs', note: '12px, ids and telemetry (font-mono)' },
    { name: 'text-caption', note: '11px, metadata under a label' },
    { name: 'text-micro', note: '10px, keyboard hints' },
] as const

const radii = [
    'rounded-sm',
    'rounded-md',
    'rounded-lg',
    'rounded-xl',
    'rounded-2xl',
] as const

function Swatches() {
    return (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {colorTokens.map((token) => (
                <li key={token} className="flex items-center gap-2">
                    <span
                        className="size-8 shrink-0 rounded-md border"
                        style={{ backgroundColor: `var(--${token})` }}
                    />
                    <span className="flex min-w-0 flex-col">
                        <span className="truncate text-ui">{token}</span>
                        <span className="truncate font-mono text-micro text-faint">
                            bg-{token}
                        </span>
                    </span>
                </li>
            ))}
        </ul>
    )
}

function TextPairs() {
    return (
        <ul className="flex flex-col gap-2">
            {textPairs.map(({ text, on }) => (
                <li
                    key={`${text}-${on}`}
                    className="rounded-md border px-3 py-1.5 text-ui"
                    style={{
                        color: `var(--${text})`,
                        backgroundColor: `var(--${on})`,
                    }}
                >
                    {text} on {on}
                </li>
            ))}
        </ul>
    )
}

function TypeScale() {
    return (
        <ul className="flex flex-col gap-2">
            {typeScale.map(({ name, note }) => (
                <li key={name} className="flex items-baseline gap-3">
                    <span className="w-28 shrink-0 font-mono text-xs text-faint">
                        {name}
                    </span>
                    <span className={name}>{note}</span>
                </li>
            ))}
        </ul>
    )
}

function Radii() {
    return (
        <ul className="flex flex-wrap gap-3">
            {radii.map((radius) => (
                <li key={radius} className="flex flex-col items-center gap-1">
                    <span className={`size-14 border bg-muted ${radius}`} />
                    <span className="font-mono text-micro text-faint">
                        {radius}
                    </span>
                </li>
            ))}
        </ul>
    )
}

function Shadow() {
    return (
        <div className="flex flex-col gap-1">
            <div className="h-16 rounded-lg border bg-popover shadow-overlay" />
            <span className="font-mono text-micro text-faint">
                shadow-overlay
            </span>
        </div>
    )
}

function Icons() {
    return (
        <div className="flex items-center gap-4">
            <ActivityIcon className="size-6" />
            <SearchIcon className="size-5" />
            <SettingsIcon className="size-4" />
            <span className="text-ui text-muted-foreground">
                stroke 1.75 on every lucide icon
            </span>
        </div>
    )
}

const parts = [
    { title: 'Colours', Part: Swatches },
    { title: 'Text on surfaces', Part: TextPairs },
    { title: 'Type scale', Part: TypeScale },
    { title: 'Radius', Part: Radii },
    { title: 'Overlay shadow', Part: Shadow },
    { title: 'Icons', Part: Icons },
]

export function TokensSection() {
    return (
        <section id="tokens" className="flex flex-col gap-4">
            <h2 className="text-lg font-medium">Tokens</h2>
            {parts.map(({ title, Part }) => (
                <div key={title} className="flex flex-col gap-2">
                    <h3 className="text-sm text-muted-foreground">{title}</h3>
                    <ThemePair>
                        <Part />
                    </ThemePair>
                </div>
            ))}
        </section>
    )
}
