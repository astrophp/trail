import { expect, test } from 'vitest'
import { basePath, routerBasename } from './base-path'

test('normalises the dashboard base path', () => {
    expect(basePath('trail')).toBe('/trail')
    expect(basePath('/admin/trail/')).toBe('/admin/trail')
    expect(basePath(undefined)).toBe('/')
})

test('encodes each segment of the router basename', () => {
    expect(routerBasename('/admin/trail')).toBe('/admin/trail')
    expect(routerBasename('/my trail/é')).toBe('/my%20trail/%C3%A9')
    expect(routerBasename('/')).toBe('/')
})
