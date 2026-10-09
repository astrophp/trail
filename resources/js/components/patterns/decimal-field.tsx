import { useId, type Ref } from 'react'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type DecimalFieldProps = {
    /** The text in the field. Blank is no value; `0` is a value. The field never turns one into the other. */
    value: string
    onValueChange: (value: string) => void
    /** The field's accessible name, whole: what it is for and for which thing. */
    label: string
    /** A short visible name for where nothing else names the field (a stacked form); the accessible name stays `label`. */
    caption?: string
    /** What is wrong with the value, beside the field. Linked to the input, and announced when it appears. */
    error?: string
    disabled?: boolean
    /** Gives the caller the input, to move focus to it. */
    inputRef?: Ref<HTMLInputElement>
    /** Styles the caption, for hiding it where a column header names the field. */
    captionClassName?: string
    className?: string
}

/**
 * A text field for a plain decimal number. It is a text input with a decimal keyboard, not a
 * number input: what is typed stays as typed (no rounding, no spinner, no scrolling the value
 * away), and the caller reads it with `parseDecimalText`. It judges nothing itself; `error` is
 * whatever the caller, or the server, has to say about the value.
 */
export function DecimalField({
    value,
    onValueChange,
    label,
    caption,
    error,
    disabled = false,
    inputRef,
    captionClassName,
    className,
}: DecimalFieldProps) {
    const id = useId()
    const errorId = `${id}-error`

    return (
        <div
            data-slot="decimal-field"
            className={cn('flex min-w-0 flex-col gap-1.5', className)}
        >
            <Label htmlFor={id} className="leading-snug">
                <span className="sr-only">{label}</span>
                {caption ? (
                    <span
                        aria-hidden="true"
                        className={cn(
                            'text-caption text-muted-foreground',
                            captionClassName,
                        )}
                    >
                        {caption}
                    </span>
                ) : null}
            </Label>
            <Input
                id={id}
                ref={inputRef}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                value={value}
                disabled={disabled}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => onValueChange(event.target.value)}
                className="tabular-nums"
            />
            {error ? (
                <FieldError id={errorId} className="text-caption">
                    {error}
                </FieldError>
            ) : null}
        </div>
    )
}
