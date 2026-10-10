import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SelectFilter } from '@/components/patterns/select-filter'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useShortcuts } from '@/hooks/use-shortcuts'
import { until } from '@/test/wait'

afterEach(() => {
    vi.restoreAllMocks()
})

function Page({
    children,
    onNext,
}: {
    children: React.ReactNode
    onNext: () => void
}) {
    useShortcuts({ 'row-next': onNext })

    return <div>{children}</div>
}

function Select() {
    const [value, setValue] = useState<string | null>(null)

    return (
        <SelectFilter
            value={value}
            onValueChange={setValue}
            options={[{ value: 'a', label: 'Agent A' }]}
            allLabel="All agents"
            aria-label="Filter by agent"
        />
    )
}

const layers = {
    dialog: {
        open: async () => {
            await userEvent.click(
                screen.getByRole('button', { name: 'Open dialog' }),
            )
            await screen.findByRole('dialog')
        },
        view: (
            <Dialog>
                <DialogTrigger asChild>
                    <Button>Open dialog</Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogTitle>A dialog</DialogTitle>
                    <DialogDescription>Something to decide.</DialogDescription>
                </DialogContent>
            </Dialog>
        ),
    },
    menu: {
        open: async () => {
            await userEvent.click(
                screen.getByRole('button', { name: 'Open menu' }),
            )
            await screen.findByRole('menu')
        },
        view: (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button>Open menu</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem>Rename</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        ),
    },
    select: {
        open: async () => {
            await userEvent.click(
                screen.getByRole('combobox', { name: 'Filter by agent' }),
            )
            await screen.findByRole('listbox')
        },
        view: <Select />,
    },
}

describe('a shortcut under a real layer', () => {
    it.each(Object.keys(layers) as (keyof typeof layers)[])(
        'does not fire while a %s is open, and fires again once it is closed',
        async (name) => {
            const onNext = vi.fn()

            render(<Page onNext={onNext}>{layers[name].view}</Page>)

            // Control: with nothing open the key fires.
            await userEvent.keyboard('j')

            expect(onNext).toHaveBeenCalledTimes(1)

            await layers[name].open()
            await userEvent.keyboard('j')

            expect(onNext).toHaveBeenCalledTimes(1)

            await userEvent.keyboard('{Escape}')
            await until(() =>
                expect(
                    document.querySelector(
                        '[role="dialog"], [role="menu"], [role="listbox"]',
                    ),
                ).toBeNull(),
            )
            // A select hands focus back to its trigger, which is a combobox: a field, to a shortcut.
            const focused = document.activeElement

            if (focused instanceof HTMLElement && name === 'select') {
                expect(focused).toHaveAttribute('role', 'combobox')
                focused.blur()
            }

            await userEvent.keyboard('j')

            expect(onNext).toHaveBeenCalledTimes(2)
        },
    )
})
