import { cva, type VariantProps } from 'class-variance-authority'
import {
    CircleAlertIcon,
    InfoIcon,
    TriangleAlertIcon,
    XIcon,
    type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import {
    Alert,
    AlertAction,
    AlertDescription,
    AlertTitle,
} from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const noticeVariants = cva('', {
    variants: {
        tone: {
            info: 'border-info/30 bg-info-soft [&>svg]:text-info',
            warning: 'border-warning/30 bg-warning-soft [&>svg]:text-warning',
            danger: 'border-destructive/30 bg-destructive-soft [&>svg]:text-destructive',
        },
    },
    defaultVariants: { tone: 'info' },
})

type Tone = NonNullable<VariantProps<typeof noticeVariants>['tone']>

/** Each tone has an icon of its own, so the tone never rests on colour alone. */
const icons: Record<Tone, LucideIcon> = {
    info: InfoIcon,
    warning: TriangleAlertIcon,
    danger: CircleAlertIcon,
}

type NoticeProps = {
    tone: Tone
    title: string
    /** What the notice says beyond its title. */
    children?: ReactNode
    /** A way to act on it: usually a button or a link, shown under the text. */
    action?: ReactNode
    /** Shows a "Dismiss" button that calls it. The caller decides whether to remember the choice. */
    onDismiss?: () => void
    className?: string
}

/**
 * A message that sits above the content it concerns and stays until the situation changes or
 * the person dismisses it. A danger notice is an alert and is announced at once; the others are
 * status messages, announced politely.
 */
export function Notice({
    tone,
    title,
    children,
    action,
    onDismiss,
    className,
}: NoticeProps) {
    const Icon = icons[tone]

    return (
        <Alert
            role={tone === 'danger' ? 'alert' : 'status'}
            data-slot="notice"
            data-tone={tone}
            className={cn(
                noticeVariants({ tone }),
                'text-foreground has-data-[slot=alert-action]:pr-10',
                className,
            )}
        >
            <Icon aria-hidden="true" />
            <AlertTitle className="text-ui font-medium">{title}</AlertTitle>
            {children ? (
                <AlertDescription className="col-start-2 text-ui text-pretty text-foreground">
                    {children}
                </AlertDescription>
            ) : null}
            {action ? (
                <div className="col-start-2 mt-1.5 flex flex-wrap gap-2">
                    {action}
                </div>
            ) : null}
            {onDismiss ? (
                <AlertAction>
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Dismiss"
                        onClick={onDismiss}
                    >
                        <XIcon aria-hidden="true" />
                    </Button>
                </AlertAction>
            ) : null}
        </Alert>
    )
}
