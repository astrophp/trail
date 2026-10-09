import type { Price } from '@/api/types'
import { DecimalField } from '@/components/patterns/decimal-field'
import { Button } from '@/components/ui/button'
import {
    rateKeys,
    rateNames,
    type Draft,
    type RateKey,
} from '@/features/usage/price-draft'

/** What a reset returns the model to, in the words of the button. */
export function resetLabel(price: Price): string {
    const { source, via } = price.default

    if (source === 'config') {
        return 'Reset to config'
    }

    return source === 'prefix' && via !== null
        ? `Reset to ${via.model}`
        : 'Reset to no rate'
}

/** Where the fields of a price that is not saved yet start from. */
function startsFrom(price: Price): string {
    if (price.source === 'config') {
        return 'The fields start from the rates in your config.'
    }

    return price.source === 'prefix' && price.via !== null
        ? `The fields start from the rates of ${price.via.model}, which apply now.`
        : 'No rate applies now, so the fields start blank.'
}

type PriceEditorProps = {
    price: Price
    draft: Draft
    onChange: (rate: RateKey, text: string) => void
    onSave: () => void
    onReset: () => void
    onCancel: () => void
    /** A ref callback for one of the fields, so focus can be moved to it. */
    fieldRef: (rate: RateKey) => (element: HTMLElement | null) => void
}

/**
 * The form of a price being edited: the four rates, what the row said when the last attempt
 * failed, and Save, Cancel and (for a saved price) a reset to what applies without it. Enter in a
 * field saves. While an attempt is under way every control of this form is disabled and no other
 * row's is.
 */
export function PriceEditor({
    price,
    draft,
    onChange,
    onSave,
    onReset,
    onCancel,
    fieldRef,
}: PriceEditorProps) {
    const busy = draft.busy !== null
    const { failure } = draft

    return (
        <form
            aria-label={`Edit the price of ${price.provider} ${price.model}`}
            noValidate
            onSubmit={(event) => {
                event.preventDefault()
                onSave()
            }}
            className="flex flex-col gap-4 py-2 whitespace-normal"
        >
            <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 roomy:grid-cols-4">
                {rateKeys.map((rate) => (
                    <DecimalField
                        key={rate}
                        label={`${rateNames[rate]} rate for ${price.provider} ${price.model}, US dollars per million tokens`}
                        caption={rateNames[rate]}
                        value={draft.fields[rate]}
                        onValueChange={(text) => onChange(rate, text)}
                        error={draft.errors[rate]}
                        disabled={busy}
                        inputRef={fieldRef(rate)}
                    />
                ))}
            </div>
            <p className="text-caption text-muted-foreground">
                {price.source === 'saved'
                    ? "Saving replaces the model's rates as a whole: a blank rate means no rate, not the default one."
                    : `${startsFrom(price)} Saving stores them as this model's own price, so later changes to the config no longer reach it until it is reset.`}
            </p>
            {failure === null ? null : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <p role="alert" className="text-ui text-destructive">
                        {failure.message}
                    </p>
                    {failure.retry === null ? null : (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={
                                failure.retry === 'save' ? onSave : onReset
                            }
                        >
                            Try again
                        </Button>
                    )}
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" size="sm" disabled={busy}>
                    {draft.busy === 'saving' ? 'Saving…' : 'Save'}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={onCancel}
                >
                    Cancel
                </Button>
                {price.source === 'saved' ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={onReset}
                        className="sm:ml-auto"
                    >
                        {draft.busy === 'resetting'
                            ? 'Resetting…'
                            : resetLabel(price)}
                    </Button>
                ) : null}
            </div>
        </form>
    )
}
