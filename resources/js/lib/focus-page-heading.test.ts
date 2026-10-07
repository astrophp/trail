import { afterEach, describe, expect, it } from 'vitest'
import { focusPageHeading } from '@/lib/focus-page-heading'

afterEach(() => {
    document.body.innerHTML = ''
})

describe('focusPageHeading', () => {
    it('focuses the heading of the main region', () => {
        document.body.innerHTML =
            '<main id="content" tabindex="-1"><h1 tabindex="-1">Traces</h1></main>'

        focusPageHeading()

        expect(document.querySelector('h1')).toHaveFocus()
    })

    it('focuses the main region when the page has no heading', () => {
        document.body.innerHTML = '<main id="content" tabindex="-1"></main>'

        focusPageHeading()

        expect(document.getElementById('content')).toHaveFocus()
    })

    it('does nothing without a main region', () => {
        document.body.innerHTML = '<button>Stay</button>'
        document.querySelector('button')?.focus()

        focusPageHeading()

        expect(document.querySelector('button')).toHaveFocus()
    })

    it('uses the region it is given', () => {
        document.body.innerHTML =
            '<section id="other" tabindex="-1"><h1 tabindex="-1">Other</h1></section>'

        focusPageHeading(document.getElementById('other'))

        expect(document.querySelector('h1')).toHaveFocus()
    })
})
