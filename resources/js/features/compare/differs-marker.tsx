import { DiffIcon } from 'lucide-react'

/** Says a row's two sides are not the same: an icon and a word, so it never rests on colour. */
export function DiffersMarker() {
    return (
        <span
            data-slot="differs-marker"
            className="inline-flex items-center gap-1 text-caption text-warning"
        >
            <DiffIcon aria-hidden="true" className="size-3" />
            Differs
        </span>
    )
}
