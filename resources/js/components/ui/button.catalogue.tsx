import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CatalogueEntry } from '@/catalogue/types'

const variants = [
    'default',
    'outline',
    'secondary',
    'ghost',
    'destructive',
    'link',
] as const

const sizes = ['xs', 'sm', 'default', 'lg'] as const

const iconSizes = ['icon-xs', 'icon-sm', 'icon', 'icon-lg'] as const

export const catalogue: CatalogueEntry = {
    title: 'Button',
    specimens: [
        {
            name: 'Variants',
            Component: () => (
                <div className="flex flex-wrap items-center gap-2">
                    {variants.map((variant) => (
                        <Button key={variant} variant={variant}>
                            {variant}
                        </Button>
                    ))}
                </div>
            ),
        },
        {
            name: 'Sizes',
            Component: () => (
                <div className="flex flex-wrap items-center gap-2">
                    {sizes.map((size) => (
                        <Button key={size} size={size}>
                            {size}
                        </Button>
                    ))}
                    {iconSizes.map((size) => (
                        <Button key={size} size={size} aria-label={size}>
                            <PlusIcon />
                        </Button>
                    ))}
                </div>
            ),
        },
        {
            name: 'Disabled',
            Component: () => (
                <div className="flex flex-wrap items-center gap-2">
                    {variants.map((variant) => (
                        <Button key={variant} variant={variant} disabled>
                            {variant}
                        </Button>
                    ))}
                </div>
            ),
        },
    ],
}
