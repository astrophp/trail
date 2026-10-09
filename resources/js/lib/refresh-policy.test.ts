import { describe, expect, it } from 'vitest'
import {
    failureLedger,
    failureStatus,
    keepsAsking,
    maxFailedRefreshes,
    refreshEvery,
    refreshState,
} from '@/lib/refresh-policy'

describe('refreshState', () => {
    it('is polling while something runs and nothing has failed', () => {
        expect(refreshState(true, null, 0)).toBe('polling')
    })

    it('is ended when nothing runs, whatever else is true', () => {
        expect(refreshState(false, null, 0)).toBe('ended')
        expect(refreshState(false, 500, maxFailedRefreshes)).toBe('ended')
    })

    it('retries after a failure and stops after the third in a row', () => {
        expect(refreshState(true, 500, 1)).toBe('retrying')
        expect(refreshState(true, null, maxFailedRefreshes - 1)).toBe(
            'retrying',
        )
        expect(refreshState(true, null, maxFailedRefreshes)).toBe('stopped')
    })

    it.each([401, 403, 404, 419])('is final at once for a %i', (status) => {
        expect(refreshState(true, status, 1)).toBe('final')
    })

    it.each([500, 502, 503, 429, null, undefined])(
        'is not final for %s',
        (status) => {
            expect(refreshState(true, status, 1)).toBe('retrying')
        },
    )

    it('asks again only while polling or retrying', () => {
        expect(keepsAsking('polling')).toBe(true)
        expect(keepsAsking('retrying')).toBe(true)
        expect(keepsAsking('stopped')).toBe(false)
        expect(keepsAsking('final')).toBe(false)
        expect(keepsAsking('ended')).toBe(false)
    })

    it('is every two seconds, up to three failures', () => {
        expect(refreshEvery).toBe(2_000)
        expect(maxFailedRefreshes).toBe(3)
    })
})

describe('failureLedger', () => {
    it('counts failures by key, clears one key and resets all', () => {
        const ledger = failureLedger()

        ledger.record('a')
        ledger.record('a')
        ledger.record('b')

        expect([
            ledger.count('a'),
            ledger.count('b'),
            ledger.count('c'),
        ]).toEqual([2, 1, 0])

        ledger.clear('a')

        expect([ledger.count('a'), ledger.count('b')]).toEqual([0, 1])

        ledger.reset()

        expect(ledger.count('b')).toBe(0)
    })
})

describe('failureStatus', () => {
    it('is the status an error carries', () => {
        expect(
            failureStatus(Object.assign(new Error('x'), { status: 404 })),
        ).toBe(404)
    })

    it('is null for an error without a status, a network failure and what is no error', () => {
        expect(failureStatus(new Error('x'))).toBeNull()
        expect(
            failureStatus(Object.assign(new Error('x'), { status: null })),
        ).toBeNull()
        expect(failureStatus({ status: 500 })).toBeNull()
        expect(failureStatus(undefined)).toBeNull()
    })
})
