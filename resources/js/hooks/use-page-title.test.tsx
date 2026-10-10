import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { describe, expect, it } from 'vitest'
import {
    PageTitleProvider,
    useCurrentPageTitle,
    usePageTitle,
} from '@/hooks/use-page-title'

function Named({ title }: { title: string | null }) {
    usePageTitle(title)

    return null
}

function Shown() {
    return <p data-testid="title">{useCurrentPageTitle() ?? 'none'}</p>
}

let go: (path: string) => void = () => {}

function Navigator() {
    const navigate = useNavigate()

    useEffect(() => {
        go = (path) => void navigate(path)
    }, [navigate])

    return null
}

function mount(page: React.ReactNode) {
    return render(
        <MemoryRouter initialEntries={['/a']}>
            <PageTitleProvider>
                <Navigator />
                <Shown />
                {page}
            </PageTitleProvider>
        </MemoryRouter>,
    )
}

const shown = () => screen.getByTestId('title').textContent

describe('page title', () => {
    it('is none until a page names itself', () => {
        mount(null)

        expect(shown()).toBe('none')
    })

    it('is the name the page gave, and none while the page does not know it yet', () => {
        const view = mount(<Named title={null} />)
        expect(shown()).toBe('none')

        view.rerender(
            <MemoryRouter initialEntries={['/a']}>
                <PageTitleProvider>
                    <Navigator />
                    <Shown />
                    <Named title="Run one" />
                </PageTitleProvider>
            </MemoryRouter>,
        )

        expect(shown()).toBe('Run one')
    })

    it('goes when the page does', () => {
        const view = mount(<Named title="Run one" />)
        expect(shown()).toBe('Run one')

        view.rerender(
            <MemoryRouter initialEntries={['/a']}>
                <PageTitleProvider>
                    <Navigator />
                    <Shown />
                </PageTitleProvider>
            </MemoryRouter>,
        )

        expect(shown()).toBe('none')
    })

    it('is none on the page the person goes to', () => {
        render(
            <MemoryRouter initialEntries={['/a']}>
                <PageTitleProvider>
                    <Navigator />
                    <Shown />
                    <Routes>
                        <Route path="/a" element={<Named title="Run one" />} />
                        <Route path="/b" element={null} />
                    </Routes>
                </PageTitleProvider>
            </MemoryRouter>,
        )
        expect(shown()).toBe('Run one')

        act(() => go('/b'))

        expect(shown()).toBe('none')
    })

    it('moves to the name of the next page at the same address', () => {
        const view = mount(<Named title="Run one" />)

        view.rerender(
            <MemoryRouter initialEntries={['/a']}>
                <PageTitleProvider>
                    <Navigator />
                    <Shown />
                    <Named title="Run two" />
                </PageTitleProvider>
            </MemoryRouter>,
        )

        expect(shown()).toBe('Run two')
    })

    it('is none outside a provider', () => {
        render(
            <MemoryRouter>
                <Shown />
                <Named title="Lost" />
            </MemoryRouter>,
        )

        expect(shown()).toBe('none')
    })
})
