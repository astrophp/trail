import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Code } from '@/components/patterns/code'

describe('Code', () => {
    it('is inline mono text by default', () => {
        render(<Code>viewTrail</Code>)

        const code = screen.getByText('viewTrail')

        expect(code.tagName).toBe('CODE')
        expect(code).toHaveClass('font-mono')
        expect(code).toHaveAttribute('data-variant', 'inline')
    })

    it('is a wrapping block on request, whole and selectable', () => {
        render(<Code variant="block">php artisan trail:resume</Code>)

        const code = screen.getByText('php artisan trail:resume')

        expect(code).toHaveAttribute('data-variant', 'block')
        expect(code).toHaveClass('font-mono', 'block', 'whitespace-pre-wrap')
        expect(code).not.toHaveClass('truncate', 'select-none')
    })

    it('takes a class name', () => {
        render(<Code className="extra">x</Code>)

        expect(screen.getByText('x')).toHaveClass('extra')
    })
})
