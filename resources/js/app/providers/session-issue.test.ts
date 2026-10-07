import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import { sessionIssueOf } from '@/app/providers/session-issue'

describe('sessionIssueOf', () => {
    it.each([401, 419])('a %s means the session ended', (status) => {
        expect(sessionIssueOf(new ApiError('No.', status))).toBe('ended')
    })

    it('a 403 means access was lost', () => {
        expect(sessionIssueOf(new ApiError('No.', 403))).toBe('denied')
    })

    it.each([404, 422, 500, 503, null])(
        'a status of %s is for whoever asked',
        (status) => {
            expect(sessionIssueOf(new ApiError('No.', status))).toBeNull()
        },
    )

    it('ignores anything that is not an API error', () => {
        expect(sessionIssueOf(new Error('boom'))).toBeNull()
        expect(sessionIssueOf({ status: 401 })).toBeNull()
        expect(sessionIssueOf(null)).toBeNull()
    })
})
