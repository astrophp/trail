import { ViewSwitch } from '@/components/patterns/view-switch'
import { useTextView, type TextView } from '@/hooks/use-text-view'

const views = [
    {
        value: 'rendered',
        label: 'Rendered',
        title: 'Rendered — applies to every answer',
    },
    { value: 'raw', label: 'Raw', title: 'Raw — applies to every answer' },
] as const satisfies readonly {
    value: TextView
    label: string
    title: string
}[]

type TextViewSwitchProps = {
    /** Names what the switch shows (`turn 3 response`); it is read out as `turn 3 response view`. */
    label: string
    className?: string
}

/**
 * Rendered or Raw for markdown answers. One choice for the whole dashboard: it switches every
 * answer, and the browser remembers it.
 */
export function TextViewSwitch({ label, className }: TextViewSwitchProps) {
    const [view, setView] = useTextView()

    return (
        <ViewSwitch
            label={`${label} view`}
            options={views}
            value={view}
            onValueChange={setView}
            className={className}
        />
    )
}
