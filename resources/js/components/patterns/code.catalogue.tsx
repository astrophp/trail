import { Code } from '@/components/patterns/code'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Code',
    specimens: [
        {
            name: 'Inline, inside a sentence',
            Component: () => (
                <p className="text-ui">
                    Run <Code>php artisan migrate</Code> once the package is
                    installed.
                </p>
            ),
        },
        {
            name: 'Block, a command on its own line',
            Component: () => (
                <Code variant="block">php artisan trail:install</Code>
            ),
        },
        {
            name: 'Block, a long line wraps instead of cutting off',
            Component: () => (
                <div className="max-w-xs">
                    <Code variant="block">
                        php artisan some:very-long-command
                        --with-an-option=value
                        --and-another-option=another-value
                    </Code>
                </div>
            ),
        },
    ],
}
