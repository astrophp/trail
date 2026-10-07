/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    colorTokens,
    contrastRatio,
    parseTheme,
    textPairs,
} from '@/catalogue/tokens'

const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8')
const themes = {
    light: parseTheme(css, ':root'),
    dark: parseTheme(css, '.dark'),
}

describe.each(Object.entries(themes))('%s theme', (_name, values) => {
    it('lists every colour variable declared in the stylesheet', () => {
        const unlisted = Object.keys(values).filter(
            (name) => !(colorTokens as readonly string[]).includes(name),
        )

        expect(unlisted, 'Add these to colorTokens').toEqual([])
    })

    it('declares every colour token as a hex value', () => {
        expect(colorTokens.filter((token) => !values[token])).toEqual([])
    })

    it.each(textPairs)('$text on $on is at least 4.5:1', ({ text, on }) => {
        expect(contrastRatio(values[text], values[on])).toBeGreaterThanOrEqual(
            4.5,
        )
    })
})

// `CONTRAST_TABLE=1 npx vitest run contrast --silent=false` prints the ratios as a markdown table.
describe.runIf(process.env.CONTRAST_TABLE)('table', () => {
    it('prints the ratios', () => {
        const rows = textPairs.map(({ text, on }) => {
            const [l, d] = Object.values(themes).map((v) =>
                contrastRatio(v[text], v[on]).toFixed(2),
            )

            return `| ${text} on ${on} | ${l} | ${d} |`
        })

        console.log(
            ['| pair | light | dark |', '|---|---|---|', ...rows].join('\n'),
        )
    })
})
