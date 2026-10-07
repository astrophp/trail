import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SetupScreen } from '@/features/setup'
import { BootContext } from '@/hooks/use-boot'
import { testBoot } from '@/test/render-app'

function show(
    recording: Parameters<typeof SetupScreen>[0]['recording'],
    environment = 'local',
) {
    return render(
        <BootContext value={testBoot({ environment })}>
            <SetupScreen recording={recording} />
        </BootContext>,
    )
}

describe('SetupScreen', () => {
    it('says Trail is recording and waiting, and what will appear', () => {
        show('enabled')

        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'Trail is recording and waiting for the first run',
            }),
        ).toBeVisible()
        expect(
            screen.getByText(
                'Each agent run will appear here with its steps, tool calls, timing, tokens and estimated cost.',
            ),
        ).toBeVisible()
    })

    it('has the two next steps, in order, with the exact names', () => {
        show('enabled')

        const steps = screen.getAllByRole('heading', { level: 2 })

        expect(steps.map((step) => step.textContent)).toEqual([
            'Run an agent',
            'Decide who can view the dashboard',
        ])
        expect(screen.getByText('laravel/ai')).toBeVisible()
        expect(screen.getByText('viewTrail')).toBeVisible()
        expect(screen.getByText('TrailServiceProvider')).toBeVisible()
        expect(screen.getByText('php artisan trail:install')).toBeVisible()
        expect(screen.getByText(/nothing to change in its code/i)).toBeVisible()
    })

    it('says the same about access in every environment, true by default', () => {
        for (const environment of ['local', 'production']) {
            const { unmount } = show('enabled', environment)

            expect(
                screen.getByText(/By default the dashboard is open in the/),
            ).toBeVisible()
            expect(screen.getByText('TrailServiceProvider')).toBeVisible()
            expect(screen.getByText('app/Providers')).toBeVisible()
            expect(
                screen.queryByText(/already set up|open to everyone here/),
            ).not.toBeInTheDocument()
            unmount()
        }
    })

    it('when paused says nothing is recorded until resumed, and how to resume', () => {
        show('paused')

        const title = screen.getByRole('heading', { level: 1 })

        expect(title).toHaveTextContent(
            'nothing will be recorded until it is resumed',
        )
        expect(title).not.toHaveTextContent(/waiting/)
        expect(screen.getByText('php artisan trail:resume')).toBeVisible()
        expect(
            screen
                .getAllByRole('heading', { level: 2 })
                .map((step) => step.textContent),
        ).toEqual([
            'Resume recording',
            'Run an agent',
            'Decide who can view the dashboard',
        ])
    })

    it('claims nothing about recording when it is not known', () => {
        show(null)

        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'No runs have been recorded yet',
            }),
        ).toBeVisible()
    })

    it('shows no table, no sample data and no alert', () => {
        show('enabled')

        expect(screen.queryByRole('table')).not.toBeInTheDocument()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('puts the commands in the mono family, whole', () => {
        show('paused')

        const command = screen.getByText('php artisan trail:resume')

        expect(command).toHaveClass('font-mono', 'whitespace-pre-wrap')
        expect(command).not.toHaveClass('truncate')
    })
})
