// Prints the size of the built dashboard files and fails when one is over its
// budget. The budget is on the gzip size; the raw size is reported for context.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const budgets = {
    'dist/app.js': 212_000,
    'dist/app.css': 18_000,
}

const kb = (bytes) => `${(bytes / 1000).toFixed(1)} kB`

const rows = Object.entries(budgets).map(([file, budget]) => {
    const source = readFileSync(file)

    return {
        file,
        raw: source.length,
        gzip: gzipSync(source, { level: 9 }).length,
        budget,
    }
})

const width = Math.max(...rows.map((row) => row.file.length))
const line = (file, ...cells) =>
    `${file.padEnd(width)}  ${cells.map((cell) => cell.padStart(10)).join('  ')}`

console.log(line('file', 'raw', 'gzip', 'budget'))
for (const { file, raw, gzip, budget } of rows) {
    console.log(
        line(file, kb(raw), kb(gzip), kb(budget)),
        gzip > budget ? ' over budget' : '',
    )
}

const over = rows.filter((row) => row.gzip > row.budget)

if (over.length > 0) {
    console.error(`Over budget: ${over.map((row) => row.file).join(', ')}`)
    process.exit(1)
}
