import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStored, removeStored, writeStored } from '@/lib/storage'

afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
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

    it('keeps session text apart from local text', () => {
        writeStored('k', 'local')
        writeStored('k', 'session', 'session')

        expect(readStored('k')).toBe('local')
        expect(readStored('k', 'session')).toBe('session')
        expect(sessionStorage.getItem('k')).toBe('session')

        removeStored('k', 'session')

        expect(readStored('k', 'session')).toBeNull()
        expect(readStored('k')).toBe('local')
    })

    it('does not throw when session storage cannot even be reached', () => {
        vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
            throw new Error('blocked')
        })

        expect(readStored('k', 'session')).toBeNull()
        expect(() => writeStored('k', 'x', 'session')).not.toThrow()
        expect(() => removeStored('k', 'session')).not.toThrow()
    })
})
