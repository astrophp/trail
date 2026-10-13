import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SearchUnitValue } from '@/components/telemetry/search-unit-value'

describe('SearchUnitValue', () => {
    it.each([
        ['0.000000', '0'],
        ['0.000001', '0.000001'],
        ['0.100000', '0.1'],
        ['999999999999.999999', '999,999,999,999.999999'],
        [null, 'Not reported'],
    ])('shows exact evidence %s as %s', (count, label) => {
        render(<SearchUnitValue count={count} />)
        expect(screen.getByText(label)).toBeInTheDocument()
    })

    it('shows pending until a quantity is final', () => {
        render(<SearchUnitValue count="0.100000" pending />)
        expect(screen.getByText('Pending')).toBeInTheDocument()
        expect(screen.queryByText('0.1')).not.toBeInTheDocument()
    })
})
