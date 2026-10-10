/** The id of the price panel's heading: what an in-page link points at and moves focus to. */
export const pricesHeadingId = 'model-prices'

/** Follows an in-page link to the price panel: focuses its heading, which brings it into view. */
export function reviewPrices(event: { preventDefault: () => void }): void {
    event.preventDefault()
    document.getElementById(pricesHeadingId)?.focus()
}
