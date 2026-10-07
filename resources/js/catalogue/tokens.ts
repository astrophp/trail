/** Every colour token declared in index.css. The swatches and the contrast test both read this list. */
export const colorTokens = [
    'background',
    'foreground',
    'card',
    'card-foreground',
    'popover',
    'popover-foreground',
    'primary',
    'primary-foreground',
    'primary-hover',
    'primary-soft',
    'primary-ink',
    'secondary',
    'secondary-foreground',
    'muted',
    'muted-foreground',
    'faint',
    'accent',
    'accent-foreground',
    'border',
    'border-strong',
    'input',
    'ring',
    'success',
    'success-soft',
    'destructive',
    'destructive-soft',
    'warning',
    'warning-soft',
    'info',
    'info-soft',
    'sidebar',
    'sidebar-foreground',
    'sidebar-primary',
    'sidebar-primary-foreground',
    'sidebar-accent',
    'sidebar-accent-foreground',
    'sidebar-border',
    'sidebar-ring',
    'chart-1',
    'chart-2',
    'chart-3',
    'chart-4',
    'chart-5',
] as const

type ColorToken = (typeof colorTokens)[number]

/** Text colour on a surface: the pairs that must stay readable (WCAG AA, 4.5:1). */
type TextPair = { text: ColorToken; on: ColorToken }

const pairsOn = (text: ColorToken, surfaces: ColorToken[]): TextPair[] =>
    surfaces.map((on) => ({ text, on }))

export const textPairs: TextPair[] = [
    ...pairsOn('foreground', [
        'background',
        'card',
        'sidebar',
        'muted',
        'accent',
    ]),
    ...pairsOn('card-foreground', ['card']),
    ...pairsOn('popover-foreground', ['popover']),
    ...pairsOn('secondary-foreground', ['secondary']),
    ...pairsOn('sidebar-foreground', ['sidebar']),
    ...pairsOn('muted-foreground', [
        'background',
        'card',
        'popover',
        'sidebar',
        'muted',
        'accent',
    ]),
    ...pairsOn('faint', ['background', 'card', 'sidebar', 'muted', 'accent']),
    ...pairsOn('primary-foreground', ['primary', 'primary-hover']),
    ...pairsOn('primary-ink', [
        'background',
        'sidebar',
        'primary-soft',
        'accent',
    ]),
    ...pairsOn('sidebar-accent-foreground', ['sidebar-accent']),
    ...pairsOn('success', ['background', 'card', 'success-soft']),
    ...pairsOn('destructive', ['background', 'card', 'destructive-soft']),
    ...pairsOn('warning', ['background', 'card', 'warning-soft']),
    ...pairsOn('info', ['background', 'card', 'info-soft']),
]

/** Theme variables of one block of index.css (`:root` or `.dark`), by name without the dashes. */
export function parseTheme(css: string, selector: ':root' | '.dark') {
    const start = css.search(new RegExp(`\\n${selector}[^{]*\\{`))
    const block = css.slice(start, css.indexOf('\n}', start))

    return Object.fromEntries(
        [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [
            m[1],
            m[2].toLowerCase(),
        ]),
    )
}

function luminance(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255

        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })

    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio between two `#rrggbb` colours. */
export function contrastRatio(a: string, b: string): number {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)

    return (light + 0.05) / (dark + 0.05)
}
