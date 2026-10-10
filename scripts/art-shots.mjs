// Retakes every image in art/ from a running workbench: the screenshots, in both themes, and the
// social preview. See art/README.md. Run it through scripts/art-shots.sh, which fetches the pinned
// Playwright this file needs.
//
//   scripts/art-shots.sh <workbench url> [--path /trail] [--out art] [--only overview,trace]
//
// It opens nothing by run id: it asks the dashboard's own API for what each page needs (a
// conversation with several turns, a run with a tool call and a delegated sub-agent, the busiest
// agent) and stops with a message when the workbench has recorded nothing suitable. It looks only
// for what the screenshots asked for, so `--only overview` needs no conversation.
//
// A light shot and its dark shot show the same page in the same state: the page is loaded once,
// shot, then the browser's colour scheme is switched, as a person's operating system does at
// dusk, and it is shot again. The script refuses to start while runs are being recorded, and fails
// when the page or the recorded data changed between the two shots.

import { createRequire } from 'node:module'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = createRequire(
    (process.env.PLAYWRIGHT_DIR ?? root) + '/',
)('playwright')

// The fixed size of every screenshot. 1440x900 at 2x is 2880x1800 pixels.
const VIEWPORT = { width: 1440, height: 900 }
const SCALE = 2
const RANGE = '1h'
// How long nothing may have been recorded before the screenshots start, in seconds.
const QUIET_SECONDS = 15
// How many times a page is shot again when it changed between its light and dark shot.
const ATTEMPTS = 3

const args = process.argv.slice(2)
const option = (name, fallback) => {
    const at = args.indexOf(name)

    return at === -1 ? fallback : args[at + 1]
}
const origin = (args.find((a) => /^https?:\/\//.test(a)) ?? '').replace(/\/$/, '')
const path = option('--path', '/trail')
const out = resolve(root, option('--out', 'art'))
const only = option('--only', null)?.split(',') ?? null

if (origin === '') {
    console.error('Usage: scripts/art-shots.sh <workbench url> [--path /trail] [--out art] [--only a,b]')
    process.exit(2)
}

class Unsuitable extends Error {}

const base = origin + path
const body = async (endpoint) => {
    const response = await fetch(`${base}/api/${endpoint}`, {
        headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
        throw new Unsuitable(`${base}/api/${endpoint} answered ${response.status}. Is the workbench running at ${origin}?`)
    }

    return response.json()
}
const api = async (endpoint) => (await body(endpoint)).data

/**
 * What the recording looks like now: how many runs there are, the newest one, whether any is in
 * flight and how long ago anything was recorded. Taken before the screenshots and after them.
 */
async function recordingState() {
    const meta = await api('meta')
    const list = await body(`traces?range=${RANGE}&per_page=1`)
    const newest = list.data[0]
    const touched = newest === undefined ? 0 : Math.max(Date.parse(newest.started_at), Date.parse(newest.ended_at ?? newest.started_at))

    return {
        running: meta.traces.running,
        total: list.pagination.total,
        newest: newest?.id ?? null,
        quietFor: (Date.parse(list.range.to) - touched) / 1000,
    }
}

async function requireQuiet() {
    const state = await recordingState()

    if (state.running > 0) {
        throw new Unsuitable(`${state.running} run(s) are still in flight. Stop the recorder (scripts/art-record.sh) and wait for them to finish, then take the screenshots at once.`)
    }
    if (state.quietFor < QUIET_SECONDS) {
        throw new Unsuitable(`A run was recorded ${Math.round(state.quietFor)} s ago. Stop the recorder (scripts/art-record.sh), wait ${QUIET_SECONDS} s, then take the screenshots at once.`)
    }

    return state
}

// What each screenshot opens, found through the API when the screenshot needs it.
const finders = {
    // A completed run, with no failed child, with a tool call and a delegated sub-agent: the one
    // with the most spans.
    async trace() {
        const traces = await api(`traces?range=${RANGE}&per_page=100`)
        let best = null

        for (const trace of traces.filter((t) => t.status === 'completed' && !t.child_failed)) {
            const { spans } = await api(`traces/${trace.id}`)
            const delegated = spans.some((s) => s.type === 'agent' && s.parent_id)
            const tools = spans.filter((s) => s.type === 'tool').length

            if (delegated && tools > 0 && (best === null || spans.length > best.spans)) {
                best = { id: trace.id, spans: spans.length }
            }
        }
        if (best === null) {
            throw new Unsuitable('No completed run with a tool call and a delegated sub-agent in the last hour. Run the delegation scenarios.')
        }

        return `/traces/${best.id}`
    },

    // A conversation of at least three turns that all completed: the one with the most turns.
    async conversation() {
        const conversations = await api(`conversations?range=${RANGE}&per_page=100`)
        const long = conversations
            .filter((c) => c.turns.all >= 3 && c.turns.completed === c.turns.all)
            .sort((a, b) => b.turns.all - a.turns.all)[0]

        if (long === undefined) {
            throw new Unsuitable('No conversation with three or more completed turns in the last hour. Run long-conversation.')
        }

        return `/conversations/transcript?${new URLSearchParams({ id: long.id })}`
    },

    // The agent with the most runs of its own.
    async agent() {
        const runsOf = (agent) => agent.top_level?.runs.all ?? 0
        const busiest = (await api(`agents?range=${RANGE}`)).sort((a, b) => runsOf(b) - runsOf(a))[0]

        if (busiest === undefined || runsOf(busiest) < 5) {
            throw new Unsuitable('No agent with five runs in the last hour.')
        }

        return `/agents/agent?${new URLSearchParams({ name: busiest.name, range: RANGE })}`
    },

    // A search word that finds something in the most groups (runs, conversations, agents), at
    // least two.
    async query() {
        let found = null
        let widest = 1

        for (const word of ['return', 'order', 'assistant', 'refund', 'policy', 'help']) {
            const result = await api(`search?q=${word}`)
            const groups = Object.values(result).filter((rows) => rows.length > 0).length

            if (groups > widest) {
                found = word
                widest = groups
            }
        }
        if (found === null) {
            throw new Unsuitable('No search word returns results in two groups (runs, conversations, agents).')
        }

        return found
    },
}

const shots = {
    overview: { url: async () => `/?range=${RANGE}` },
    traces: { url: async () => `/traces?range=${RANGE}` },
    trace: {
        url: finders.trace,
        // Select the delegated sub-agent's tool call, so the inspector shows the evidence for it.
        before: async (page) => {
            await page.getByRole('treeitem').filter({ hasText: 'Tool call' }).first().click()
        },
    },
    conversation: { url: finders.conversation },
    agent: { url: finders.agent },
    usage: { url: async () => `/usage?range=${RANGE}` },
    palette: {
        url: async () => `/traces?range=${RANGE}`,
        before: async (page) => {
            const query = await finders.query()

            await page.keyboard.press('ControlOrMeta+k')
            await page.getByRole('dialog').waitFor()
            await page.keyboard.type(query, { delay: 40 })
            await page.waitForLoadState('networkidle')
            await page.waitForTimeout(800)
        },
    },
}

/** The page is done: network idle, no skeleton, charts drawn, nothing focused or hovered. */
async function settle(page) {
    await page.waitForLoadState('networkidle')
    await page.waitForFunction(
        () => document.querySelectorAll('[data-slot="skeleton"], .animate-pulse, [aria-busy="true"]').length === 0,
    )
    await page.waitForTimeout(2500)
    await page.evaluate(() => document.activeElement?.blur?.())
    await page.mouse.move(VIEWPORT.width - 1, VIEWPORT.height - 1)
    await page.waitForTimeout(300)
}

/**
 * What the page says, for comparing its two shots: its text, without the "Updated ... ago" label,
 * which is the one text that moves by itself, and the dialog's text when one is open.
 */
const textOf = (page) =>
    page.evaluate(() => document.body.innerText.replace(/Updated [^\n]*/g, '').replace(/\s+/g, ' ').trim())

async function takeScreenshots(browser) {
    const names = Object.keys(shots).filter((name) => only === null || only.includes(name))

    // The colour scheme is the browser's, which the dashboard follows until a person picks a theme
    // of their own with its toggle. Switching it live is what an operating system does at dusk.
    const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        colorScheme: 'light',
    })

    for (const name of names) {
        const shot = shots[name]
        const url = await shot.url()
        let taken = false

        for (let attempt = 1; attempt <= ATTEMPTS && !taken; attempt++) {
            const page = await context.newPage()

            await page.emulateMedia({ colorScheme: 'light' })
            await page.goto(base + url)
            await settle(page)
            await shot.before?.(page)
            await settle(page)
            await page.waitForFunction(() => !document.documentElement.classList.contains('dark'))
            const lightText = await textOf(page)
            await page.screenshot({ path: `${out}/${name}-light.png` })

            await page.emulateMedia({ colorScheme: 'dark' })
            await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
            await page.waitForTimeout(1200)
            const darkText = await textOf(page)
            await page.screenshot({ path: `${out}/${name}-dark.png` })
            await page.close()

            if (lightText === darkText) {
                taken = true
                console.log(`${name}-light.png, ${name}-dark.png`)
            } else {
                console.log(`${name}: the page changed between its light and its dark shot (attempt ${attempt} of ${ATTEMPTS})`)
            }
        }

        if (!taken) {
            throw new Unsuitable(`${name} kept changing between its light and its dark shot. Is something still recording?`)
        }
    }

    await context.close()
}

/** art/social-preview.png: 1280x640, from the logo and the hero screenshot. */
async function takeSocialPreview(browser) {
    const hero = readFileSync(`${out}/overview-light.png`).toString('base64')
    const logo = readFileSync(`${out}/logo-light.svg`).toString('base64')

    // The dashboard's own colours and type, read from its page rather than copied here.
    const page = await browser.newPage({ viewport: VIEWPORT, colorScheme: 'light' })
    await page.goto(base + '/')
    await page.waitForLoadState('networkidle')
    const theme = await page.evaluate(() => {
        const body = getComputedStyle(document.body)
        const muted = getComputedStyle(document.querySelector('p, [class*="muted"]') ?? document.body)

        return { background: body.backgroundColor, color: body.color, font: body.fontFamily, muted: muted.color }
    })
    await page.close()

    const card = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 })
    await card.setContent(`<!doctype html><meta charset="utf-8"><style>
        * { box-sizing: border-box; margin: 0 }
        html, body { width: 1280px; height: 640px; overflow: hidden; background: ${theme.background}; color: ${theme.color}; font-family: ${theme.font} }
        .copy { position: absolute; left: 72px; top: 96px; width: 470px }
        .logo { height: 84px }
        h1 { margin-top: 56px; font-size: 52px; line-height: 1.1; font-weight: 650; letter-spacing: -0.02em }
        p { margin-top: 28px; font-size: 26px; line-height: 1.35; color: ${theme.muted} }
        .shot { position: absolute; left: 590px; top: 150px; width: 900px; border: 2px solid rgba(127,127,127,.35); border-radius: 18px; box-shadow: 0 24px 60px rgba(0,0,0,.18) }
    </style>
    <div class="copy">
        <img class="logo" src="data:image/svg+xml;base64,${logo}" alt="">
        <h1>See what your AI agents did.</h1>
        <p>Open-source observability for the Laravel AI SDK, in your own app.</p>
    </div>
    <img class="shot" src="data:image/png;base64,${hero}" alt="">`)
    await card.waitForTimeout(500)
    await card.screenshot({ path: `${out}/social-preview.png` })
    console.log('social-preview.png')
    await card.close()
}

mkdirSync(out, { recursive: true })

const wantsScreenshots = only === null || only.some((name) => name !== 'social-preview')
const wantsSocial = only === null || only.includes('social-preview')
let browser

try {
    const before = wantsScreenshots ? await requireQuiet() : null

    browser = await chromium.launch({
        // The installed Google Chrome by default. ART_BROWSER=chromium uses Playwright's own build.
        ...(process.env.ART_BROWSER === 'chromium' ? {} : { channel: 'chrome' }),
    })

    if (wantsScreenshots) {
        await takeScreenshots(browser)

        const after = await recordingState()
        if (after.total !== before.total || after.newest !== before.newest || after.running !== 0) {
            throw new Unsuitable(`Runs were recorded while the screenshots were taken (${before.total} runs before, ${after.total} after). Stop the recorder and take them again.`)
        }
    }

    if (wantsSocial) {
        await takeSocialPreview(browser)
    }
} catch (error) {
    if (error instanceof Unsuitable) {
        console.error(`\nCannot retake the screenshots: ${error.message}`)
        process.exit(1)
    }

    throw error
} finally {
    await browser?.close()
}
