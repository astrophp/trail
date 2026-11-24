import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RedactionMark } from '@/components/patterns/redaction-mark'

describe('RedactionMark', () => {
    it('shows the marker and says what it means', () => {
        render(<RedactionMark text="[redacted]" />)

        const mark = screen.getByTitle('Redacted before it was stored')

        expect(mark).toHaveAttribute('data-slot', 'redaction')
        expect(mark).toHaveTextContent(
            '[redacted] (redacted before it was stored)',
        )
    })
})
