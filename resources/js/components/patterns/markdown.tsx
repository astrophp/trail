import type { Element } from 'hast'
import { ImageIcon, SquareCheckIcon, SquareIcon } from 'lucide-react'
import {
    createContext,
    type ComponentProps,
    memo,
    useContext,
    useId,
    type ReactNode,
} from 'react'
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CappedText } from '@/components/patterns/capped-text'
import { Code } from '@/components/patterns/code'
import { CopyButton } from '@/components/patterns/copy-button'
import { ErrorBoundary } from '@/components/patterns/error-boundary'
import {
    rehypeMarkers,
    remarkHtmlAsText,
    textOf,
} from '@/components/patterns/markdown-plugins'
import { notify } from '@/components/patterns/notify'
import { RedactionMark } from '@/components/patterns/redaction-mark'
import { Separator } from '@/components/ui/separator'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { formatCount } from '@/lib/format'
import {
    nestsTooDeep,
    protectMarkers,
    restoreMarkers,
    safeUrl,
    sentinelFor,
} from '@/lib/markdown'
import { cn } from '@/lib/utils'

type Markers = { marker: string; sentinel: string }

const MarkersContext = createContext<Markers>({ marker: '', sentinel: '' })

/** Whether a `code` element is the body of a fenced or indented block rather than a span. */
const BlockContext = createContext(false)

/** The level an answer's top headings take: one below the heading the answer sits under. */
const HeadingLevelContext = createContext(3)

const linkClass =
    'text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary'

/** A text from the parser, with its redaction markers drawn as marks. */
function Marked({ text }: { text: string }) {
    const { marker, sentinel } = useContext(MarkersContext)

    if (sentinel === '' || !text.includes(sentinel)) {
        return text
    }

    return text
        .split(sentinel)
        .flatMap((piece, index) => [
            index > 0 ? (
                <RedactionMark key={`m${index}`} text={marker} />
            ) : null,
            piece === '' ? null : piece,
        ])
}

/** An address with the sentinel put back where the parser percent-encoded it. */
const decoded = (url: string, sentinel: string) =>
    sentinel === ''
        ? url
        : url.split(encodeURIComponent(sentinel)).join(sentinel)

/** `https://`, `http://` and `mailto:` are left off when deciding whether a link says where it goes. */
const bare = (url: string) => url.replace(/^(https?:\/\/|mailto:)/i, '')

/** An address the reader can open on purpose, written out; an address that is not safe stays text. */
function Address({ url: written }: { url: string }) {
    const { sentinel } = useContext(MarkersContext)
    const url = decoded(written, sentinel)
    const target =
        sentinel !== '' && url.includes(sentinel) ? null : safeUrl(url)
    const shown = <Marked text={url} />

    return target === null ? (
        <span data-slot="markdown-address" className="wrap-anywhere">
            {shown}
        </span>
    ) : (
        <a
            href={target}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={cn('wrap-anywhere', linkClass)}
        >
            {shown}
        </a>
    )
}

type LinkProps = ComponentProps<'a'> & ExtraProps

/**
 * A link that cannot hide where it goes: when its text is not its address, the address follows
 * it. An unsafe scheme, or an address with a redaction marker in it, is not a link at all.
 */
function Link({ node, href: written = '', children }: LinkProps) {
    const { sentinel } = useContext(MarkersContext)
    const href = decoded(written, sentinel)

    // Footnote references and back references stay inside the answer.
    if (href.startsWith('#')) {
        return (
            <a href={href} className={linkClass}>
                {children}
            </a>
        )
    }

    const label = textOf(node, sentinel)
    const target =
        sentinel !== '' && href.includes(sentinel) ? null : safeUrl(href)
    const plain = bare(label) === bare(href)

    if (target === null) {
        return (
            <span data-slot="markdown-unsafe-link">
                {plain ? null : <>{children} </>}
                <span className="text-muted-foreground">
                    {plain ? null : '('}
                    <Address url={href} />
                    {plain ? null : ')'}
                </span>{' '}
                <span
                    title="Trail follows only http, https and mailto links."
                    className="rounded-sm border px-1 text-caption whitespace-nowrap text-muted-foreground"
                >
                    not linked
                </span>
            </span>
        )
    }

    return (
        <>
            <a
                href={target}
                title={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={cn('wrap-anywhere', linkClass)}
            >
                {children}
            </a>
            {plain ? null : (
                <span className="wrap-anywhere text-muted-foreground">
                    {' ('}
                    {href}
                    {')'}
                </span>
            )}
        </>
    )
}

type ImageProps = ComponentProps<'img'> & ExtraProps

/** An image is never loaded: it is named by its description and its address. */
function Image({ src, alt }: ImageProps) {
    const url = typeof src === 'string' ? src : ''
    const data = /^\s*data:([^;,]*)/i.exec(url)

    return (
        <span
            data-slot="markdown-image"
            className="inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 rounded-md border bg-muted px-2 py-0.5 text-xs"
        >
            <ImageIcon aria-hidden="true" className="size-3.5 self-center" />
            <span className="font-medium">Image not loaded:</span>
            {alt ? (
                <Marked text={alt} />
            ) : (
                <span className="text-muted-foreground">no description</span>
            )}
            {url === '' ? null : data !== null ? (
                <span className="text-muted-foreground">
                    ({data[1] || 'data'}, {formatCount(url.length)} characters
                    of inline data)
                </span>
            ) : (
                <span className="text-muted-foreground">
                    (<Address url={url} />)
                </span>
            )}
        </span>
    )
}

type PreProps = ComponentProps<'pre'> & ExtraProps

const plainLanguages = ['text', 'txt', 'plain', 'plaintext']

/** A fenced or indented block: its language, a copy button, and the code as written. */
function CodeBlock({ node, children }: PreProps) {
    const { marker, sentinel } = useContext(MarkersContext)
    const code = node?.children.find(
        (child): child is Element =>
            child.type === 'element' && child.tagName === 'code',
    )
    const classes = code?.properties.className
    const language = (Array.isArray(classes) ? classes : [])
        .map(String)
        .find((name) => name.startsWith('language-'))
        ?.slice('language-'.length)
    const text = () =>
        restoreMarkers(textOf(code, sentinel), marker, sentinel).replace(
            /\n$/,
            '',
        )
    const label = language ? `Copy ${language} code` : 'Copy code'
    // A plain-text fence says nothing worth a label.
    const named = language !== undefined && !plainLanguages.includes(language)

    return (
        <div
            data-slot="markdown-code"
            className="min-w-0 overflow-hidden rounded-lg border bg-muted"
        >
            <div className="flex items-center justify-between gap-2 border-b py-0.5 ps-3 pe-1">
                <span className="font-mono text-caption text-muted-foreground">
                    {named ? language : null}
                </span>
                <CopyButton
                    text={text}
                    label={label}
                    onCopied={() => notify.success('Copied code')}
                    onFailed={() => notify.error('Could not copy code')}
                />
            </div>
            <BlockContext.Provider value={true}>
                {/* Lines are kept as written; a long one scrolls inside the block. */}
                <pre className="min-w-0 overflow-x-auto">{children}</pre>
            </BlockContext.Provider>
        </div>
    )
}

type CodeProps = ComponentProps<'code'> & ExtraProps

function CodeSpan({ children }: CodeProps) {
    const block = useContext(BlockContext)

    return block ? (
        <Code
            variant="block"
            className="w-max min-w-full rounded-none border-0 bg-transparent text-xs break-normal whitespace-pre"
        >
            {children}
        </Code>
    ) : (
        <Code className="text-xs">{children}</Code>
    )
}

type SpanProps = ComponentProps<'span'> & ExtraProps

function Span({ node, children, ...props }: SpanProps) {
    const { marker } = useContext(MarkersContext)

    if (node !== undefined && 'dataRedaction' in node.properties) {
        return <RedactionMark text={marker} />
    }

    return <span {...props}>{children}</span>
}

type InputProps = ComponentProps<'input'> & ExtraProps

/** The mark of a task list item: whether it is done, which can only be read. */
function TaskBox({ type, checked }: InputProps) {
    if (type !== 'checkbox') {
        return null
    }

    const done = checked === true
    const Icon = done ? SquareCheckIcon : SquareIcon

    return (
        <span
            data-slot="markdown-task"
            className={cn(
                'mt-0.5 shrink-0',
                done ? 'text-foreground' : 'text-muted-foreground',
            )}
        >
            <Icon aria-hidden="true" className="size-4" />
            <span className="sr-only">{done ? 'Done: ' : 'Not done: '}</span>
        </span>
    )
}

type HeadingProps = { children?: ReactNode }

/**
 * A heading of the answer, set one level below the heading the answer sits under, so the page's
 * outline stays the dashboard's. More room above than below ties it to what it heads.
 */
const heading = (depth: number) =>
    function Heading({ children }: HeadingProps) {
        const base = useContext(HeadingLevelContext)
        const level = Math.min(6, base + depth - 1)
        const Tag = `h${level}` as 'h3'

        return (
            <Tag
                className={cn(
                    'mt-2 font-semibold first:mt-0',
                    depth <= 2 ? 'text-base' : 'text-ui',
                    depth === 6 && 'text-muted-foreground',
                )}
            >
                {children}
            </Tag>
        )
    }

const components: Components = {
    p: ({ children }) => <p>{children}</p>,
    h1: heading(1),
    h2: heading(2),
    h3: heading(3),
    h4: heading(4),
    h5: heading(5),
    h6: heading(6),
    ul: ({ className, children }) => (
        <ul
            className={cn(
                'flex flex-col gap-1',
                className?.includes('contains-task-list')
                    ? 'list-none'
                    : 'list-disc ps-5',
            )}
        >
            {children}
        </ul>
    ),
    ol: ({ start, children }) => (
        <ol start={start} className="flex list-decimal flex-col gap-1 ps-5">
            {children}
        </ol>
    ),
    li: ({ className, children }) => (
        <li
            className={cn(
                'ps-0.5 [&>ol]:mt-1 [&>ul]:mt-1',
                className?.includes('task-list-item') &&
                    'flex items-start gap-2 ps-0',
            )}
        >
            {children}
        </li>
    ),
    blockquote: ({ children }) => (
        <blockquote className="flex flex-col gap-3 border-s-2 ps-4 text-muted-foreground">
            {children}
        </blockquote>
    ),
    hr: () => <Separator />,
    a: Link,
    img: Image,
    pre: CodeBlock,
    code: CodeSpan,
    span: Span,
    input: TaskBox,
    del: ({ children }) => <del className="line-through">{children}</del>,
    table: ({ children }) => (
        <div className="min-w-0 overflow-hidden rounded-lg border">
            <Table className="text-ui">{children}</Table>
        </div>
    ),
    thead: ({ children }) => (
        <TableHeader className="bg-muted">{children}</TableHeader>
    ),
    tbody: ({ children }) => <TableBody>{children}</TableBody>,
    tr: ({ children }) => <TableRow>{children}</TableRow>,
    th: ({ style, children }) => (
        <TableHead style={style} className="whitespace-normal">
            {children}
        </TableHead>
    ),
    td: ({ style, children }) => (
        <TableCell style={style} className="whitespace-normal">
            {children}
        </TableCell>
    ),
    section: ({ children }) => (
        <section className="border-t pt-3 text-caption text-muted-foreground">
            {children}
        </section>
    ),
}

/** A part that cannot be drawn as markdown, shown as the plain text it is. */
function AsPlainText({ text, marker }: { text: string; marker: string }) {
    return (
        <div data-slot="markdown-fallback" className="flex flex-col gap-1">
            <p className="text-caption text-muted-foreground">
                Shown as plain text: this part is nested too deeply to draw as
                markdown.
            </p>
            <CappedText
                text={text}
                redactionMarker={marker}
                chunk={Math.max(text.length, 1)}
            />
        </div>
    )
}

type MarkdownProps = {
    /** The markdown as stored. */
    text: string
    /** Text that stands for a removed value; wherever it occurs it is drawn as a redaction marker. */
    redactionMarker: string
    /** What stands for the marker while the text is parsed; see `sentinelFor`. Worked out from the text when left out. */
    sentinel?: string
    /** The level of the answer's top headings: one below the heading the answer sits under. */
    headingLevel?: number
    className?: string
}

/**
 * Markdown (GitHub's flavour) drawn as elements, never as HTML: raw HTML stays text, an image is
 * named and never loaded, a link says where it goes and only http, https and mailto addresses are
 * followed (any other is marked as not linked). Redaction markers are marked wherever they occur,
 * code included.
 */
export const Markdown = memo(function Markdown({
    text,
    redactionMarker,
    sentinel = sentinelFor(text),
    headingLevel = 3,
    className,
}: MarkdownProps) {
    // Footnote ids from two answers on one page must not collide.
    const prefix = `${useId().replace(/:/g, '')}-`

    if (nestsTooDeep(text)) {
        return <AsPlainText text={text} marker={redactionMarker} />
    }

    return (
        <MarkersContext.Provider value={{ marker: redactionMarker, sentinel }}>
            <HeadingLevelContext.Provider value={headingLevel}>
                <div
                    data-slot="markdown"
                    className={cn(
                        'flex min-w-0 flex-col gap-3 break-words',
                        className,
                    )}
                >
                    <ErrorBoundary
                        fallback={() => (
                            <AsPlainText text={text} marker={redactionMarker} />
                        )}
                    >
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkHtmlAsText]}
                            rehypePlugins={[[rehypeMarkers, sentinel]]}
                            remarkRehypeOptions={{ clobberPrefix: prefix }}
                            // The components check every address themselves and show it as written.
                            urlTransform={(url) => url}
                            components={components}
                        >
                            {protectMarkers(text, redactionMarker, sentinel)}
                        </ReactMarkdown>
                    </ErrorBoundary>
                </div>
            </HeadingLevelContext.Provider>
        </MarkersContext.Provider>
    )
})
