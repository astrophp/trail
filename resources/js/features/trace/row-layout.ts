/** The marker on the disclosure chevron, so a click on it can be told from a click on the row. */
export const toggleSlot = 'span-row-toggle'

/** Rows deeper than this are indented no further, so a deep chain keeps room for its name. */
const maxIndentLevels = 8

/** The indent of a row at a depth of the tree. */
export const rowIndent = (depth: number) => ({
    paddingInlineStart: `calc(var(--spacing) * ${Math.min(depth, maxIndentLevels) * 4})`,
})
