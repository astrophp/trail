/**
 * The look of the strip and of one of its cells, shared by the strip, its skeleton and `Metric`.
 *
 * The strip is a container: it is one row from `3xl` of its own width and two columns below it,
 * wherever it sits. Every cell has a line on its right and under it, and the strip hides the
 * lines of its last column and row (`-mr-px -mb-px` inside `overflow-hidden`), so the dividers
 * come out right for any number of cells without knowing the count.
 */
export const metricStripClassName =
    '@container overflow-hidden border-y border-border'

export const metricStripGridClassName =
    '-mr-px -mb-px grid grid-cols-2 @3xl:grid-flow-col @3xl:auto-cols-fr @3xl:grid-cols-none'

export const metricCellClassName =
    'relative min-w-0 border-r border-b border-border px-4 py-4 odd:pl-0 last:odd:col-span-2 @3xl:px-6 @3xl:py-5 @3xl:odd:pl-6 @3xl:first:odd:pl-0 @3xl:last:odd:col-span-1'
