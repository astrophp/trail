import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    CommandPalette,
    CommandPaletteFooter,
    CommandPaletteGroup,
    CommandPaletteHint,
    CommandPaletteInput,
    CommandPaletteItem,
    CommandPaletteLink,
    CommandPaletteList,
    CommandPaletteRow,
    CommandPaletteStatus,
} from '@/components/patterns/command-palette'
import { stubResizeObserver } from '@/test/resize-observer'
import { until } from '@/test/wait'

beforeEach(() => {
    stubResizeObserver()
})

afterEach(() => {
    vi.restoreAllMocks()
})

type Handlers = {
    onOpenChange?: (open: boolean) => void
    onSelect?: (value: string) => void
    onFollow?: () => void
    status?: React.ReactNode
    spokenOnly?: boolean
    action?: React.ReactNode
}

function Harness({
    onOpenChange,
    onSelect,
    onFollow,
    status,
    spokenOnly,
    action,
}: Handlers) {
    const [value, setValue] = useState('')

    return (
        <MemoryRouter>
            <CommandPalette
                open
                onOpenChange={onOpenChange ?? (() => {})}
                value={value}
                onValueChange={setValue}
                title="Search"
                description="Find a page."
                label="Search the pages"
            >
                <CommandPaletteInput placeholder="Search…" />
                <CommandPaletteList label="Results">
                    <CommandPaletteGroup heading="Pages">
                        {['One', 'Two', 'Three'].map((name) => (
                            <CommandPaletteItem
                                key={name}
                                value={name}
                                onSelect={onSelect}
                            >
                                <CommandPaletteLink
                                    to={`/${name.toLowerCase()}`}
                                    onFollow={onFollow}
                                >
                                    <CommandPaletteRow meta="Page">
                                        {name}
                                    </CommandPaletteRow>
                                </CommandPaletteLink>
                            </CommandPaletteItem>
                        ))}
                    </CommandPaletteGroup>
                </CommandPaletteList>
                <CommandPaletteStatus spokenOnly={spokenOnly} action={action}>
                    {status}
                </CommandPaletteStatus>
                <CommandPaletteFooter>
                    <CommandPaletteHint keys={['enter']}>
                        open
                    </CommandPaletteHint>
                </CommandPaletteFooter>
            </CommandPalette>
        </MemoryRouter>
    )
}

const names = () =>
    screen.getAllByRole('option').map((option) => option.textContent)
const selected = () =>
    screen
        .getAllByRole('option')
        .filter((option) => option.getAttribute('aria-selected') === 'true')
        .map((option) => option.textContent)

describe('CommandPalette', () => {
    it('is a dialog with a name and a description, a search row and a listbox in groups', () => {
        render(<Harness />)

        const dialog = screen.getByRole('dialog', { name: 'Search' })

        expect(dialog).toHaveAccessibleDescription('Find a page.')
        expect(
            within(dialog).getByRole('combobox', { name: 'Search the pages' }),
        ).toHaveAttribute('placeholder', 'Search…')
        expect(
            within(dialog).getByRole('listbox', { name: 'Results' }),
        ).toBeInTheDocument()
        expect(
            within(dialog).getByRole('group', { name: 'Pages' }),
        ).toBeInTheDocument()
        expect(names()).toEqual(['OnePage', 'TwoPage', 'ThreePage'])
    })

    it('is not there when closed', () => {
        render(
            <MemoryRouter>
                <CommandPalette
                    open={false}
                    onOpenChange={() => {}}
                    value=""
                    onValueChange={() => {}}
                    title="Search"
                    description="Find a page."
                    label="Search the pages"
                >
                    <CommandPaletteInput />
                </CommandPalette>
            </MemoryRouter>,
        )

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows the text it is given and reports what is typed', async () => {
        const user = userEvent.setup()
        render(<Harness />)

        await user.type(
            screen.getByRole('combobox', { name: 'Search the pages' }),
            'ab',
        )

        expect(
            screen.getByRole('combobox', { name: 'Search the pages' }),
        ).toHaveValue('ab')
        // It does not filter: whoever fills the list does.
        expect(names()).toEqual(['OnePage', 'TwoPage', 'ThreePage'])
    })

    it('moves the active option with the arrows and says which in aria-activedescendant', async () => {
        const user = userEvent.setup()
        render(<Harness />)
        const row = screen.getByRole('combobox', { name: 'Search the pages' })

        expect(selected()).toEqual(['OnePage'])

        await user.keyboard('{ArrowDown}{ArrowDown}')

        const active = screen
            .getAllByRole('option')
            .find((option) => option.getAttribute('aria-selected') === 'true')

        expect(selected()).toEqual(['ThreePage'])
        expect(row).toHaveAttribute('aria-activedescendant', active?.id)

        await user.keyboard('{ArrowDown}')

        // It wraps round.
        expect(selected()).toEqual(['OnePage'])
    })

    it('exposes the option that is active from the start, before any arrow key', async () => {
        render(<Harness />)

        const [first] = screen.getAllByRole('option')

        await until(() =>
            expect(first).toHaveAttribute('aria-selected', 'true'),
        )
        expect(first?.id).not.toBe('')
        await until(() =>
            expect(
                screen.getByRole('combobox', { name: 'Search the pages' }),
            ).toHaveAttribute('aria-activedescendant', first?.id),
        )
    })

    it('chooses the active option with Enter', async () => {
        const user = userEvent.setup()
        const onSelect = vi.fn()
        render(<Harness onSelect={onSelect} />)

        await user.keyboard('{ArrowDown}{Enter}')

        expect(onSelect).toHaveBeenCalledTimes(1)
        expect(onSelect).toHaveBeenCalledWith('Two')
    })

    it('asks to close on Escape', async () => {
        const user = userEvent.setup()
        const onOpenChange = vi.fn()
        render(<Harness onOpenChange={onOpenChange} />)

        await user.keyboard('{Escape}')

        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it.each([
        ['Control', '{Control>}{Enter}{/Control}'],
        ['Meta', '{Meta>}{Enter}{/Meta}'],
    ])(
        'opens the active link in a new tab on %s+Enter, and chooses nothing',
        async (_name, keys) => {
            const user = userEvent.setup()
            const open = vi.spyOn(window, 'open').mockReturnValue(null)
            const onSelect = vi.fn()
            render(<Harness onSelect={onSelect} />)

            await user.keyboard(`{ArrowDown}${keys}`)

            expect(open).toHaveBeenCalledTimes(1)
            expect(open).toHaveBeenCalledWith(
                `${window.location.origin}/two`,
                '_blank',
                'noopener',
            )
            expect(onSelect).not.toHaveBeenCalled()
        },
    )

    it('has a real link in each option', () => {
        render(<Harness />)

        expect(
            screen
                .getAllByRole('link')
                .map((link) => link.getAttribute('href')),
        ).toEqual(['/one', '/two', '/three'])
    })

    it('calls onFollow for a plain click on a link, and does not choose the option a second time', async () => {
        const user = userEvent.setup()
        const onFollow = vi.fn()
        const onSelect = vi.fn()
        render(<Harness onFollow={onFollow} onSelect={onSelect} />)

        await user.click(screen.getByRole('link', { name: 'OnePage' }))

        expect(onFollow).toHaveBeenCalledTimes(1)
        expect(onSelect).not.toHaveBeenCalled()
    })

    it('leaves it open when a link is followed with a modifier key', async () => {
        const user = userEvent.setup()
        const onFollow = vi.fn()
        render(<Harness onFollow={onFollow} />)

        // jsdom cannot open another document; the browser's default is not what is tested.
        const stay = (event: Event) => event.preventDefault()
        document.addEventListener('click', stay, true)
        await user.keyboard('{Control>}')
        await user.click(screen.getByRole('link', { name: 'OnePage' }))
        await user.keyboard('{/Control}')
        document.removeEventListener('click', stay, true)

        expect(onFollow).not.toHaveBeenCalled()
    })

    it('keeps its links out of the Tab order', () => {
        render(<Harness />)

        for (const link of screen.getAllByRole('link')) {
            expect(link).toHaveAttribute('tabindex', '-1')
        }
    })
})

describe('CommandPaletteStatus', () => {
    it('is one live region, drawn with its action', () => {
        render(
            <Harness
                status="The search failed."
                action={<button type="button">Try again</button>}
            />,
        )

        expect(screen.getAllByRole('status')).toHaveLength(1)
        expect(screen.getByRole('status')).toHaveTextContent(
            'The search failed.',
        )
        expect(
            screen.getByRole('button', { name: 'Try again' }),
        ).toBeInTheDocument()
    })

    it('can be spoken only, without its action', () => {
        render(
            <Harness
                status="3 results."
                spokenOnly
                action={<button type="button">Try again</button>}
            />,
        )

        expect(screen.getByRole('status')).toHaveTextContent('3 results.')
        expect(
            screen.queryByRole('button', { name: 'Try again' }),
        ).not.toBeInTheDocument()
    })

    it('is in the page, empty, before it has anything to say, so the first sentence is announced', () => {
        render(<Harness />)

        expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })
})
