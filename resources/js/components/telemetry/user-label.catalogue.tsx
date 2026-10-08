import type { User } from '@/api/types'
import { UserLabel } from '@/components/telemetry/user-label'
import type { CatalogueEntry } from '@/catalogue/types'

const user: User = {
    id: '7',
    type: 'App\\Models\\User',
    name: 'Ada Lovelace',
    email: 'ada@example.test',
}

export const catalogue: CatalogueEntry = {
    title: 'User label',
    specimens: [
        { name: 'Name', Component: () => <UserLabel user={user} /> },
        {
            name: 'Name no longer resolved (the id)',
            Component: () => (
                <UserLabel user={{ ...user, name: null, email: null }} />
            ),
        },
    ],
}
