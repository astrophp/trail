import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStored, removeStored, writeStored } from '@/lib/storage'

afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
})

describe('storage', () => {
    it('round-trips text as it is, and removes it', () => {
        writeStored('k', 'dark')

        expect(localStorage.getItem('k')).toBe('dark')
        expect(readStored('k')).toBe('dark')

        removeStored('k')

        expect(readStored('k')).toBeNull()
    })

    it('does not throw when storage does', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('denied')
        })
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('full')
        })
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('denied')
        })

        expect(readStored('k')).toBeNull()
        expect(() => writeStored('k', 'x')).not.toThrow()
        expect(() => removeStored('k')).not.toThrow()
    })
})
