import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn', () => {
    it.each(['title', 'heading', 'ui', 'caption', 'micro'])(
        'treats text-%s as a font size',
        (size) => {
            expect(cn(`text-${size}`, 'text-faint')).toBe(
                `text-${size} text-faint`,
            )
            expect(cn('text-faint', `text-${size}`)).toBe(
                `text-faint text-${size}`,
            )
            expect(cn('text-sm', `text-${size}`)).toBe(`text-${size}`)
            expect(cn(`text-${size}`, 'text-xs')).toBe('text-xs')
        },
    )

    it('lets the later colour win', () => {
        expect(cn('text-faint', 'text-foreground')).toBe('text-foreground')
        expect(cn('text-primary-ink', 'text-muted-foreground')).toBe(
            'text-muted-foreground',
        )
    })

    it('knows the custom colour, border and shadow tokens', () => {
        expect(cn('bg-primary-soft', 'bg-accent')).toBe('bg-accent')
        expect(cn('bg-accent', 'bg-primary-soft')).toBe('bg-primary-soft')
        expect(cn('border-border-strong', 'border-border')).toBe(
            'border-border',
        )
        expect(cn('border', 'border-border-strong')).toBe(
            'border border-border-strong',
        )
        expect(cn('shadow-overlay', 'shadow-sm')).toBe('shadow-sm')
        expect(cn('shadow-sm', 'shadow-overlay')).toBe('shadow-overlay')
        expect(cn('shadow-overlay', 'shadow-primary')).toBe(
            'shadow-overlay shadow-primary',
        )
    })

    it('keeps the unrelated classes of a different group', () => {
        expect(cn('text-micro uppercase', 'tracking-widest')).toBe(
            'text-micro uppercase tracking-widest',
        )
    })
})
