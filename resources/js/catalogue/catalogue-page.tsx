import { ThemePair } from '@/catalogue/theme-pair'
import type { LocatedEntry } from '@/catalogue/entries'

export function CataloguePage({ entries }: { entries: LocatedEntry[] }) {
    return (
        <main className="mx-auto flex max-w-6xl flex-col gap-8 p-6">
            <header className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold">
                    Trail component catalogue
                </h1>
                <nav aria-label="Sections">
                    <ul className="flex flex-wrap gap-4 text-sm">
                        {entries.map((entry) => (
                            <li key={entry.id}>
                                <a
                                    className="text-muted-foreground underline-offset-4 hover:underline"
                                    href={`#${entry.id}`}
                                >
                                    {entry.layer} / {entry.title}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>
            </header>
            {entries.map((entry) => (
                <section
                    key={entry.id}
                    id={entry.id}
                    className="flex flex-col gap-4"
                >
                    <h2 className="text-lg font-medium">
                        {entry.title}{' '}
                        <span className="text-sm text-muted-foreground">
                            {entry.layer}
                        </span>
                    </h2>
                    {entry.specimens.map((specimen) => (
                        <div
                            key={specimen.name}
                            className="flex flex-col gap-2"
                        >
                            <h3 className="text-sm text-muted-foreground">
                                {specimen.name}
                            </h3>
                            <ThemePair>
                                <specimen.Component />
                            </ThemePair>
                        </div>
                    ))}
                </section>
            ))}
        </main>
    )
}
