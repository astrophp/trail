import { expect, test } from 'vitest'
import { basePath } from './base-path'

test('normalises the dashboard base path', () => {
    expect(basePath('trail')).toBe('/trail')
    expect(basePath('/admin/trail/')).toBe('/admin/trail')
    expect(basePath(undefined)).toBe('/')
})
