/**
 * The content of a cell whose figure does not exist for the row: an agent seen only as a
 * sub-agent has no runs of its own, so no error rate, duration, cost or trend. Nothing is drawn,
 * and a screen reader is told rather than left with an empty cell.
 */
export function NotApplicable() {
    return <span className="sr-only">Does not apply</span>
}
