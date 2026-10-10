// Retakes every image in art/ from a running workbench: the screenshots, in both themes, and the
// social preview. See art/README.md. Run it through scripts/art-shots.sh, which fetches the pinned
// Playwright this file needs.
//
//   scripts/art-shots.sh <workbench url> [--path /trail] [--out art] [--only overview,trace]
//
// It opens nothing by run id: it asks the dashboard's own API for a conversation with several
// turns, a run with a tool call and a delegated sub-agent, and the busiest agent, and stops with a
// message when the workbench has recorded nothing suitable.

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
const THEMES = ['light', 'dark']

const args = process.argv.slice(2)
const option = (name, fallback) => {
    const at = args.indexOf(name)

    return at === -1 ? fallback : args[at + 1]
}
const origin = (args.find((a) => /^https?:\/\//.test(a)) ?? '').replace(/\/$/, '')
const path = option('--path', '/trail')
const out = resolve(root, option('--out', 'art'))
const only = option('--only', null)?.split(',')

if (origin === '') {
    console.error('Usage: scripts/art-shots.sh <workbench url> [--path /trail] [--out art] [--only a,b]')
    process.exit(2)
}

class Unsuitable extends Error {}

const base = origin + path
const api = async (endpoint) => {
    const response = await fetch(`${base}/api/${endpoint}`, {
        headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
        throw new Unsuitable(`${base}/api/${endpoint} answered ${response.status}. Is the workbench running at ${origin}?`)
    }

    return (await response.json()).data
}

/** What each screenshot opens, found through the API. */
async function discover() {
    const found = {}

    const traces = await api(`traces?range=${RANGE}&per_page=100`)
    if (traces.length < 20) {
        throw new Unsuitable(`Only ${traces.length} runs in the last hour. Record more first (art/README.md).`)
    }

    // A completed run, with no failed child, with a tool call and a delegated sub-agent: the newest one with the most spans.
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
    found.trace = `/traces/${best.id}`

    // A conversation of at least three turns that all completed: the one with the most turns.
    const conversations = await api(`conversations?range=${RANGE}&per_page=100`)
    const long = conversations
        .filter((c) => c.turns.all >= 3 && c.turns.completed === c.turns.all)
        .sort((a, b) => b.turns.all - a.turns.all)[0]
    if (long === undefined) {
        throw new Unsuitable('No conversation with three or more completed turns in the last hour. Run long-conversation.')
    }
    found.conversation = `/conversations/transcript?${new URLSearchParams({ id: long.id })}`

    // The agent with the most runs.
    const runsOf = (agent) => agent.top_level?.runs.all ?? 0
    const agents = await api(`agents?range=${RANGE}`)
    const busiest = agents.sort((a, b) => runsOf(b) - runsOf(a))[0]
    if (busiest === undefined || runsOf(busiest) < 5) {
        throw new Unsuitable('No agent with five runs in the last hour.')
    }
    found.agent = `/agents/agent?${new URLSearchParams({ name: busiest.name, range: RANGE })}`

    // A search word that finds something in at least two groups, for the command palette.
    let widest = 1
    for (const word of ['return', 'order', 'assistant', 'refund', 'policy', 'help']) {
        const result = await api(`search?q=${word}`)
        const groups = Object.values(result).filter((rows) => rows.length > 0).length

        if (groups > widest) {
            found.query = word
            widest = groups
        }
    }
    if (found.query === undefined) {
        throw new Unsuitable('No search word returns results in two groups (runs, conversations, agents).')
    }

    return found
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

const shots = (found) => ({
    overview: { url: `/?range=${RANGE}` },
    traces: { url: `/traces?range=${RANGE}` },
    trace: {
        url: found.trace,
        // Select the delegated sub-agent's tool call, so the inspector shows the evidence for it.
        before: async (page) => {
            await page.getByRole('treeitem').filter({ hasText: 'Tool call' }).first().click()
        },
    },
    conversation: { url: found.conversation },
    agent: { url: found.agent },
    usage: { url: `/usage?range=${RANGE}` },
    palette: {
        url: `/traces?range=${RANGE}`,
        before: async (page) => {
            await page.keyboard.press('ControlOrMeta+k')
            await page.getByRole('dialog').waitFor()
            await page.keyboard.type(found.query, { delay: 40 })
            await page.waitForLoadState('networkidle')
            await page.waitForTimeout(800)
        },
    },
})

async function takeScreenshots(browser, found) {
    const wanted = Object.entries(shots(found)).filter(([name]) => only === undefined || only === null || only.includes(name))

    for (const theme of THEMES) {
        // The theme is chosen the way the dashboard's own toggle keeps it: the `trail-theme` entry
        // in local storage. The browser's colour scheme follows, as it would for a person.
        const context = await browser.newContext({
            viewport: VIEWPORT,
            deviceScaleFactor: SCALE,
            colorScheme: theme,
        })
        await context.addInitScript((value) => {
            try {
                localStorage.setItem('trail-theme', value)
            } catch {
                // Storage is a convenience; the colour scheme above still applies.
            }
        }, theme)

        for (const [name, shot] of wanted) {
            const page = await context.newPage()
            await page.goto(base + shot.url)
            await settle(page)
            await shot.before?.(page)
            await settle(page)
            await page.screenshot({ path: `${out}/${name}-${theme}.png` })
            await page.close()
            console.log(`${name}-${theme}.png`)
        }

        await context.close()
    }
}

/** art/social-preview.png: 1280x640, from the logo and the hero screenshot. */
async function takeSocialPreview(browser) {
    const hero = readFileSync(`${out}/overview-light.png`).toString('base64')
    const logo = readFileSync(`${out}/logo-light.svg`).toString('base64')

    // The dashboard's own colours and type, read from its page rather than copied here.
    const page = await browser.newPage({ viewport: VIEWPORT })
    await page.addInitScript(() => localStorage.setItem('trail-theme', 'light'))
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

let browser
try {
    const found = await discover()
    browser = await chromium.launch({
        // The installed Google Chrome by default. ART_BROWSER=chromium uses Playwright's own build.
        ...(process.env.ART_BROWSER === 'chromium' ? {} : { channel: 'chrome' }),
    })
    await takeScreenshots(browser, found)

    if (only === undefined || only === null || only.includes('social-preview')) {
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
