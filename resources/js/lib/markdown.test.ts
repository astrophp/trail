import { describe, expect, it } from 'vitest'
import { cutPoint } from '@/lib/json'
import {
    blockCutPoint,
    nestsTooDeep,
    quoteDepthLimit,
    referenceDefinitions,
    protectMarkers,
    restoreMarkers,
    safeUrl,
    sentinelFor,
} from '@/lib/markdown'

describe('safeUrl', () => {
    it.each([
        'https://example.com/a?b=c#d',
        'http://example.com',
        'mailto:someone@example.com',
        'HTTPS://EXAMPLE.COM',
        '/relative/path',
        'relative/a:b',
        '?query=a:b',
        '#fragment',
        'example.com',
    ])('allows %s', (url) => {
        expect(safeUrl(url)).toBe(url)
    })

    it.each([
        'javascript:alert(1)',
        'JaVaScRiPt:alert(1)',
        ' javascript:alert(1)',
        'java\tscript:alert(1)',
        'java\nscript:alert(1)',
        'java\u0000script:alert(1)',
        'vbscript:msgbox(1)',
        'data:text/html,<script>alert(1)</script>',
        'data:image/png;base64,AAAA',
        'file:///etc/passwd',
        'ftp://example.com',
        'blob:https://example.com/1',
    ])('refuses %j', (url) => {
        expect(safeUrl(url)).toBeNull()
    })
})

describe('markers', () => {
    it('round-trips a text through a sentinel', () => {
        const text = 'key [redacted] and [redacted].'
        const sentinel = sentinelFor(text)
        const protectedText = protectMarkers(text, '[redacted]', sentinel)

        expect(protectedText).not.toContain('[redacted]')
        expect(restoreMarkers(protectedText, '[redacted]', sentinel)).toBe(text)
    })

    it('picks a sentinel the text does not contain', () => {
        expect(sentinelFor('ab')).toBe('')
    })

    it('leaves the text alone with no marker', () => {
        expect(protectMarkers('a [redacted]', '', '')).toBe('a [redacted]')
    })
})

describe('blockCutPoint', () => {
    const marker = '[redacted]'

    it('takes the whole of a text that fits', () => {
        expect(blockCutPoint('short', 0, 100, marker)).toBe(5)
    })

    it('ends at the last blank line before the cut', () => {
        const text = 'a'.repeat(70) + '\n\n' + 'b'.repeat(100)

        expect(blockCutPoint(text, 0, 100, marker)).toBe(72)
    })

    it('moves on to the next blank line when the one before is too early', () => {
        const text = 'a\n\n' + 'b'.repeat(120) + '\n\n' + 'c'.repeat(100)

        expect(blockCutPoint(text, 0, 100, marker)).toBe(125)
    })

    it('never ends inside a code fence', () => {
        const fence = '```\n' + 'x\n\n'.repeat(40) + '```\n'
        const text = 'intro\n\n' + fence + '\n' + 'z'.repeat(200)
        const end = blockCutPoint(text, 0, 60, marker)

        expect(end === 7 || end === 7 + fence.length).toBe(true)
    })

    it('treats a tilde fence like a backtick fence', () => {
        const fence = '~~~\n' + 'x\n\n'.repeat(40) + '~~~\n'
        const text = 'intro\n\n' + fence + '\n' + 'z'.repeat(200)
        const end = blockCutPoint(text, 0, 60, marker)

        expect(end === 7 || end === 7 + fence.length).toBe(true)
    })

    it('falls back to the plain cut in a text with no blank line', () => {
        const text = 'a'.repeat(99) + '\u{1F600}' + 'b'.repeat(500)

        expect(blockCutPoint(text, 0, 100, marker)).toBe(
            cutPoint(text, 100, marker),
        )
    })

    it('never splits a fence longer than two parts', () => {
        const fence = '```\n' + 'x = 1\n'.repeat(1500) + '```\n'
        const text = fence + '\nAfter.'
        const end = blockCutPoint(text, 0, 4000, marker)

        expect(fence.length).toBeGreaterThan(8000)
        expect(end).toBe(fence.length)
    })

    it('runs a fence that is never closed to the end of the text', () => {
        const text = '```\n' + 'x = 1\n'.repeat(1500)

        expect(blockCutPoint(text, 0, 4000, marker)).toBe(text.length)
    })

    it('starts from the given position', () => {
        const text =
            'a'.repeat(10) + '\n\n' + 'b'.repeat(70) + '\n\n' + 'c'.repeat(100)

        expect(blockCutPoint(text, 12, 100, marker)).toBe(84)
    })
})

describe('nestsTooDeep', () => {
    it('allows ordinary quotes', () => {
        expect(nestsTooDeep('> a\n> > b\n\nc > d')).toBe(false)
        expect(nestsTooDeep('> '.repeat(quoteDepthLimit) + 'x')).toBe(false)
    })

    it('refuses a line nested past the limit, with or without spaces', () => {
        expect(nestsTooDeep('> '.repeat(quoteDepthLimit + 1) + 'x')).toBe(true)
        expect(nestsTooDeep('a\n' + '>'.repeat(500))).toBe(true)
    })
})

describe('referenceDefinitions', () => {
    it('finds the definitions outside code fences', () => {
        const text = [
            'See [the docs][docs].',
            '',
            '[docs]: https://example.com/docs',
            '```',
            '[not]: https://example.com/inside-a-fence',
            '```',
            '  [also]: <https://example.com/also> "Title"',
        ].join('\n')

        expect(referenceDefinitions(text)).toEqual([
            '[docs]: https://example.com/docs',
            '  [also]: <https://example.com/also> "Title"',
        ])
    })
})
