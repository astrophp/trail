import { ChevronRightIcon, FileTextIcon } from 'lucide-react'
import type { Span } from '@/api/types'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { CountTag } from '@/features/trace/count-tag'
import { truncationAt } from '@/components/telemetry/payload-truncation'
import { StoredPayload } from '@/components/telemetry/stored-payload'
import { formatCount } from '@/lib/format'

type SystemPromptProps = {
    span: Pick<Span, 'truncated_paths'>
    text: string
}

/** The agent's system prompt, closed until asked for: it is long and the same on every run. */
export function SystemPrompt({ span, text }: SystemPromptProps) {
    // The tag counts what is stored; when that is a cut, the row says so before it is opened.
    const { truncated } = truncationAt(span.truncated_paths, 'input.system')

    return (
        <Collapsible data-slot="system-prompt" className="min-w-0">
            <h3>
                <CollapsibleTrigger asChild>
                    <button
                        type="button"
                        className="group/system flex w-full items-center gap-2 rounded-lg border bg-muted px-3.5 py-3 text-start text-ui text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <FileTextIcon
                            aria-hidden="true"
                            className="size-3.5 shrink-0"
                        />
                        System prompt
                        <CountTag>
                            {formatCount(text.length)}{' '}
                            {text.length === 1 ? 'char' : 'chars'}
                            {truncated ? ' · cut short' : null}
                        </CountTag>
                        <ChevronRightIcon
                            aria-hidden="true"
                            className="ms-auto size-4 shrink-0 transition-transform group-data-[state=open]/system:rotate-90"
                        />
                    </button>
                </CollapsibleTrigger>
            </h3>
            <CollapsibleContent className="pt-3">
                <StoredPayload
                    span={span}
                    path="input.system"
                    label="system prompt"
                    value={text}
                />
            </CollapsibleContent>
        </Collapsible>
    )
}
