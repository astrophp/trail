import { screen } from '@testing-library/react'

export const row = (name: string | RegExp) =>
    screen.getByRole('treeitem', { name })
export const rows = () => screen.getAllByRole('treeitem')
export const names = () => rows().map((item) => item.getAttribute('aria-label'))
