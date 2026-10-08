import { describe, expect, it } from 'vitest'
import { normalizeSearch, searchParam } from '@/lib/search'

describe('normalizeSearch', () => {
    it('trims and caps the text', () => {
        expect(normalizeSearch('  x  ')).toBe('x')
        expect(normalizeSearch('b'.repeat(250))).toHaveLength(200)
    })
})

describe('searchParam', () => {
    it('is empty by default and reads the URL as the box does', () => {
        expect(searchParam.default).toBe('')
        expect(searchParam.parse('  hi there  ')).toBe('hi there')
        expect(searchParam.parse('a'.repeat(300))).toBe('a'.repeat(200))
    })
})
