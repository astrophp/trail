import type { ReactNode } from 'react'
import { CountChip } from '@/components/patterns/count-chip'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export type CountTab = {
    value: string
    label: string
    /** `undefined` while the count is not known: no chip is shown. */
    count?: number
}

type CountTabsProps = {
    tabs: CountTab[]
    value: string
    onValueChange: (value: string) => void
    /** Shown between the tab list and the panel, outside the panel: controls that apply to every tab. */
    toolbar?: ReactNode
    /** The content the tabs control: shown in the panel of the current tab. */
    children?: ReactNode
    'aria-label': string
    className?: string
}

/** Tabs that pick one view of a list, each with an optional count. The row scrolls sideways when it must. */
export function CountTabs({
    tabs,
    value,
    onValueChange,
    toolbar,
    children,
    'aria-label': ariaLabel,
    className,
}: CountTabsProps) {
    return (
        <Tabs
            value={value}
            onValueChange={onValueChange}
            // Arrows move focus; Enter or Space choose. The value may start a fetch.
            activationMode="manual"
            data-slot="count-tabs"
            className={cn('gap-0', className)}
        >
            <TabsList
                variant="line"
                aria-label={ariaLabel}
                // Radix focuses a trigger from script on mouse down, which browsers may report as
                // keyboard focus. The list records what the last input was; see the trigger.
                onPointerDown={(event) => {
                    event.currentTarget.dataset.input = 'pointer'
                }}
                onKeyDown={(event) => {
                    event.currentTarget.dataset.input = 'keyboard'
                }}
                className="w-full min-w-0 [scrollbar-width:none] justify-start gap-4.25 overflow-x-auto rounded-none border-b p-0 group-data-horizontal/tabs:h-auto [&::-webkit-scrollbar]:hidden"
            >
                {tabs.map((tab) => (
                    <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className="h-auto flex-none gap-1.75 rounded-sm border-0 border-b-2 border-b-transparent px-1 pt-2.75 pb-3 text-xs text-muted-foreground after:hidden hover:text-foreground focus-visible:border-b-transparent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset group-data-[input=pointer]/tabs-list:focus-visible:ring-0 dark:text-muted-foreground data-active:border-b-primary data-active:text-primary-ink focus-visible:data-active:border-b-primary dark:data-active:text-primary-ink dark:group-data-[variant=line]/tabs-list:data-active:border-b-primary"
                    >
                        {tab.label}
                        {tab.count === undefined ? null : ' '}
                        <CountChip
                            count={tab.count}
                            active={tab.value === value}
                        />
                    </TabsTrigger>
                ))}
            </TabsList>
            {toolbar}
            {/* Not a tab stop: the content has controls of its own, and an unfocusable panel needs no ring. */}
            <TabsContent value={value} tabIndex={-1}>
                {children}
            </TabsContent>
        </Tabs>
    )
}
