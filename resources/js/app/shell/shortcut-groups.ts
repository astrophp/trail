import type { ShortcutGroup } from '@/components/patterns/shortcuts-dialog'
import {
    keyCaps,
    scopeHeadings,
    shortcutScopes,
    shortcuts,
    type ShortcutId,
    type ShortcutScope,
} from '@/lib/shortcuts'

/**
 * The table of shortcuts as the help shows it: one group per scope. The scopes that apply to the
 * page come first (its own, then `everywhere`) and are marked; the others follow in the table's
 * order. A group that applies lists only what can be done on the page now (`available`); the
 * others list their whole scope. A shortcut is in at most one group.
 */
export function shortcutGroups(
    page: Exclude<ShortcutScope, 'everywhere'> | undefined,
    apple: boolean,
    available: ReadonlySet<ShortcutId>,
): ShortcutGroup[] {
    const applying: ShortcutScope[] =
        page === undefined ? ['everywhere'] : [page, 'everywhere']
    const ordered = [
        ...applying,
        ...shortcutScopes.filter((scope) => !applying.includes(scope)),
    ]

    return ordered
        .map((scope) => ({
            id: scope,
            heading: scopeHeadings[scope],
            applies: applying.includes(scope),
            rows: shortcuts
                // What applies here is what can be done here; the other scopes are reference.
                .filter(
                    (entry) =>
                        entry.scope === scope &&
                        (!applying.includes(scope) || available.has(entry.id)),
                )
                .map((entry) => ({
                    id: entry.id,
                    label: entry.label,
                    keys: keyCaps(entry.id, apple),
                })),
        }))
        .filter((group) => group.rows.length > 0)
}
