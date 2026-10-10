import { cva } from 'class-variance-authority'
import { Badge } from '@/components/ui/badge'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

const chip = cva(
    'h-auto rounded-sm px-1.25 py-px text-micro font-normal tabular-nums',
    {
        variants: {
            active: {
                true: 'bg-primary-soft text-primary-ink',
                false: 'bg-muted text-muted-foreground',
            },
        },
        defaultVariants: { active: false },
    },
)

type CountChipProps = {
    /** `undefined` means the count is not known (yet): nothing is shown, never a zero. */
    count?: number
    /** The chip sits on the selected or pressed control. */
    active?: boolean
    className?: string
}

/** A small number beside a label, with thousands separators. */
export function CountChip({
    count,
    active = false,
    className,
}: CountChipProps) {
    if (count === undefined) {
        return null
    }

    return (
        <Badge
            variant="secondary"
            data-slot="count-chip"
            className={cn(chip({ active }), className)}
        >
            {formatCount(count)}
        </Badge>
    )
}
