import type { ReactNode } from 'react'
import { Code } from '@/components/patterns/code'
import { PageHeader } from '@/components/patterns/page-header'
import { cn } from '@/lib/utils'

type SetupScreenProps = {
    /** The recording state the API reported; anything but `enabled` or `paused` is not claimed either way. */
    recording: 'enabled' | 'paused' | 'disabled' | null | undefined
    className?: string
}

const happening = {
    enabled: {
        title: 'Trail is recording and waiting for the first run',
        text: 'Each agent run will appear here with its steps, tool calls, timing, tokens and estimated cost.',
    },
    paused: {
        title: 'Recording is paused: nothing will be recorded until it is resumed',
        text: 'Once recording is resumed, each agent run will appear here with its steps, tool calls, timing, tokens and estimated cost.',
    },
    unknown: {
        title: 'No runs have been recorded yet',
        text: 'Each agent run will appear here with its steps, tool calls, timing, tokens and estimated cost.',
    },
} as const

function Step({
    number,
    title,
    children,
}: {
    number: number
    title: string
    children: ReactNode
}) {
    return (
        <li className="flex gap-3.5">
            <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-caption text-muted-foreground tabular-nums"
            >
                {number}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2 text-ui text-muted-foreground">
                <h2 className="text-heading text-foreground">{title}</h2>
                {children}
            </div>
        </li>
    )
}

/**
 * What the dashboard shows when no run has ever been recorded, in place of the empty pages: that
 * Trail is recording (or is paused), what will appear, and the two things worth doing next. It
 * shows nothing invented: no sample data and no preview of a table.
 */
export function SetupScreen({ recording, className }: SetupScreenProps) {
    const state =
        happening[
            recording === 'paused' || recording === 'enabled'
                ? recording
                : 'unknown'
        ]
    const steps: { title: string; body: ReactNode }[] = []

    if (recording === 'paused') {
        steps.push({
            title: 'Resume recording',
            body: (
                <>
                    <p>Recording was paused. Resume it with:</p>
                    <Code variant="block">php artisan trail:resume</Code>
                </>
            ),
        })
    }

    steps.push({
        title: 'Run an agent',
        body: (
            <p>
                Any <Code>laravel/ai</Code> agent in your application is
                recorded. There is nothing to change in its code.
            </p>
        ),
    })
    steps.push({
        title: 'Decide who can view the dashboard',
        body: (
            <p>
                By default the dashboard is open in the <Code>local</Code>{' '}
                environment and closed everywhere else until the application
                says who may view it. Define the <Code>viewTrail</Code> gate in
                the <Code>TrailServiceProvider</Code> that{' '}
                <Code>php artisan trail:install</Code> publishes to{' '}
                <Code>app/Providers</Code>.
            </p>
        ),
    })

    return (
        <section
            data-slot="setup-screen"
            className={cn('flex max-w-2xl flex-col gap-6', className)}
        >
            <PageHeader title={state.title} description={state.text} />
            <ol className="flex flex-col gap-5">
                {steps.map((step, index) => (
                    <Step
                        key={step.title}
                        number={index + 1}
                        title={step.title}
                    >
                        {step.body}
                    </Step>
                ))}
            </ol>
        </section>
    )
}
