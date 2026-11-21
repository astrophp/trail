import { Markdown } from '@/components/patterns/markdown'
import type { CatalogueEntry } from '@/catalogue/types'

const answer = `## Your order

Order **NW-10517** is _being packed_. Here is what it holds:

| Item | Qty | Price |
| :-- | :-: | --: |
| Ridgeline rain shell | 1 | €129.00 |
| Trail socks | 3 | €27.00 |

- [x] Payment received
- [ ] Shipped

1. Packing
2. ~~Waiting for stock~~

> Orders usually leave within two business days.

Run \`php artisan trail:prune\` to clear old runs:

\`\`\`bash
php artisan trail:prune --hours=72
TRAIL_TOKEN=[redacted]
\`\`\`

---

Read [the docs](https://example.com/docs) or https://example.com.`

const unsafe = `<script>alert(1)</script>

[a bad link](javascript:alert(1))

![A product photo](https://example.com/photo.jpg)

The key was [redacted] in \`KEY=[redacted]\`.`

export const catalogue: CatalogueEntry = {
    title: 'Markdown',
    specimens: [
        {
            name: 'An answer',
            Component: () => (
                <Markdown
                    text={answer}
                    redactionMarker="[redacted]"
                    className="text-ui"
                />
            ),
        },
        {
            name: 'HTML, unsafe links, images and markers',
            Component: () => (
                <Markdown
                    text={unsafe}
                    redactionMarker="[redacted]"
                    className="text-ui"
                />
            ),
        },
    ],
}
