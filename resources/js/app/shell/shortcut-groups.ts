import type { ShortcutGroup } from '@/components/patterns/shortcuts-dialog'
import {
    keyCaps,
    scopeHeadings,
    shortcutScopes,
    shortcuts,
    type ShortcutScope,
} from '@/lib/shortcuts'

/**
 * The table of shortcuts as the help shows it: one group per scope. The scopes that apply to the
 * page come first (its own, then `everywhere`) and are marked; the others follow in the table's
 * order. Every shortcut of the table is in exactly one group.
 */
export function shortcutGroups(
    page: Exclude<ShortcutScope, 'everywhere'> | undefined,
    apple: boolean,
): ShortcutGroup[] {
    const applying: ShortcutScope[] =
        page === undefined ? ['everywhere'] : [page, 'everywhere']
    const ordered = [
        ...applying,
        ...shortcutScopes.filter((scope) => !applying.includes(scope)),
    ]

    return ordered.map((scope) => ({
        id: scope,
        heading: scopeHeadings[scope],
        applies: applying.includes(scope),
        rows: shortcuts
            .filter((entry) => entry.scope === scope)
            .map((entry) => ({
                id: entry.id,
                label: entry.label,
                keys: keyCaps(entry.id, apple),
            })),
    }))
}
