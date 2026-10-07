import js from '@eslint/js'
import boundaries from 'eslint-plugin-boundaries'
import checkFile from 'eslint-plugin-check-file'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import { resolve } from 'node:path'
import tseslint from 'typescript-eslint'

// The rules in docs/frontend.md that say "Enforced" live here: the layers, the
// conventions and the tokens, applied in the numbered blocks at the bottom.

// ---------------------------------------------------------------------------
// Layers: what each layer of resources/js may import. A layer may always import
// itself. Anything not listed here is an error.
// ---------------------------------------------------------------------------
const mayImport = {
    app: [
        'pages',
        'features',
        'telemetry',
        'patterns',
        'ui',
        'api',
        'hooks',
        'lib',
    ],
    pages: ['features', 'telemetry', 'patterns', 'ui', 'hooks', 'lib'],
    features: ['telemetry', 'patterns', 'ui', 'api', 'hooks', 'lib'],
    telemetry: ['patterns', 'ui', 'api', 'hooks', 'lib'],
    patterns: ['ui', 'hooks', 'lib'],
    ui: ['hooks', 'lib'],
    api: ['lib'],
    hooks: ['lib'],
    lib: [],
}

// A feature is reached through its index.ts only.
const featureEntry = { type: 'features', fileInternalPath: 'index.ts' }

const target = (layer) =>
    layer === 'features' ? featureEntry : { type: layer }

const layerPolicies = Object.entries(mayImport).map(([layer, layers]) => ({
    from: { element: { type: layer } },
    allow: { to: { element: [layer, ...layers].map(target) } },
}))

const boundariesSettings = {
    'boundaries/root-path': resolve(import.meta.dirname, 'resources/js'),
    // The @/ alias comes from tsconfig.json `paths`.
    'import/resolver': {
        typescript: { project: resolve(import.meta.dirname, 'tsconfig.json') },
    },
    // Folders: each is one layer. They are anchored at resources/js.
    'boundaries/elements': [
        { type: 'app', pattern: 'app', partialMatch: false },
        { type: 'pages', pattern: 'pages', partialMatch: false },
        {
            type: 'features',
            pattern: 'features/*',
            capture: ['feature'],
            partialMatch: false,
        },
        {
            type: 'telemetry',
            pattern: 'components/telemetry',
            partialMatch: false,
        },
        {
            type: 'patterns',
            pattern: 'components/patterns',
            partialMatch: false,
        },
        { type: 'ui', pattern: 'components/ui', partialMatch: false },
        { type: 'api', pattern: 'api', partialMatch: false },
        { type: 'hooks', pattern: 'hooks', partialMatch: false },
        { type: 'lib', pattern: 'lib', partialMatch: false },
        { type: 'catalogue', pattern: 'catalogue', partialMatch: false },
        { type: 'test', pattern: 'test', partialMatch: false },
    ],
    // Single files, wherever they are.
    'boundaries/files': [
        { category: 'entry', pattern: 'main.tsx' },
        { category: 'stylesheet', pattern: '**/*.css' },
        { category: 'test', pattern: '**/*.test.{ts,tsx}' },
        { category: 'catalogue', pattern: '**/*.catalogue.tsx' },
    ],
}

const boundariesRules = {
    'boundaries/no-unknown-files': 'error',
    'boundaries/no-unknown-dependencies': 'error',
    'boundaries/dependencies': [
        'error',
        {
            default: 'disallow',
            // Same-layer imports are checked too, so a test or catalogue file
            // beside its component cannot be imported by it.
            checkInternals: true,
            message:
                'Imports go down the layers only: see "Layers" in docs/frontend.md.',
            // The last policy that matches wins.
            policies: [
                {
                    from: { file: { categories: 'entry' } },
                    allow: {
                        to: [
                            { element: { type: ['app', 'lib'] } },
                            { file: { categories: 'stylesheet' } },
                        ],
                    },
                },
                ...layerPolicies,
                // Stylesheets are imported by the entry points of the app and the catalogue.
                {
                    from: { element: { type: 'catalogue' } },
                    allow: { to: { file: { categories: 'stylesheet' } } },
                },
                // A feature may use its own files, never another feature's.
                {
                    from: { element: { type: 'features' } },
                    allow: {
                        to: {
                            element: {
                                type: 'features',
                                captured: {
                                    feature:
                                        '{{ from.element.captured.feature }}',
                                },
                            },
                        },
                    },
                },
                {
                    from: { element: { type: 'features' } },
                    disallow: {
                        to: {
                            element: {
                                type: 'features',
                                captured: {
                                    feature:
                                        '!{{ from.element.captured.feature }}',
                                },
                            },
                        },
                    },
                    message:
                        'A feature never imports another feature. Move what both need down to telemetry or patterns.',
                },
                {
                    from: { element: { type: ['app', 'pages'] } },
                    disallow: {
                        to: {
                            element: {
                                type: 'features',
                                fileInternalPath: '!index.ts',
                            },
                        },
                    },
                    message:
                        "A feature is used through its index.ts: import '@/features/<name>', not a file inside it.",
                },
                {
                    from: { element: { type: 'pages' } },
                    disallow: { to: { element: { type: 'api' } } },
                    message:
                        'Pages do not import api/. Data reaches a page through a feature.',
                },
                // Nothing imports a test or catalogue file, except such files.
                {
                    disallow: {
                        to: [
                            { file: { categories: ['test', 'catalogue'] } },
                            { element: { type: ['test', 'catalogue'] } },
                        ],
                    },
                    message:
                        'Test and catalogue files are not imported by application code.',
                },
                {
                    from: [
                        { file: { categories: ['test', 'catalogue'] } },
                        { element: { type: ['test', 'catalogue'] } },
                    ],
                    allow: {
                        to: [
                            { element: { type: Object.keys(mayImport) } },
                            { element: { type: ['test', 'catalogue'] } },
                            {
                                file: {
                                    categories: [
                                        'test',
                                        'catalogue',
                                        'stylesheet',
                                    ],
                                },
                            },
                        ],
                    },
                },
            ],
        },
    ],
}

// ---------------------------------------------------------------------------
// Conventions
// ---------------------------------------------------------------------------
const stateLibraries = {
    group: [
        'redux',
        '@reduxjs/toolkit',
        'react-redux',
        'zustand',
        'jotai',
        'recoil',
        'mobx',
        'mobx-react-lite',
        'valtio',
        'xstate',
        '@xstate/react',
    ].flatMap((name) => [name, `${name}/**`]),
    message:
        'There is no global client state library. Server state lives in the query cache, view state in the URL, short-lived UI state in the component (docs/frontend.md, "State").',
}

const noDefaultExport = {
    selector: 'ExportDefaultDeclaration',
    message: 'No default exports: export by name.',
}

// ---------------------------------------------------------------------------
// Tokens: no hex colours or arbitrary pixel/rem sizes outside components/ui.
// A hex colour is flagged inside a Tailwind arbitrary value (`text-[#7463df]`)
// or when it is the whole string of 3, 4, 6 or 8 hex digits (`'#7463df'`). Known
// false positive: a whole-string id or anchor that happens to be hex ('#add').
// ---------------------------------------------------------------------------
const hexColour = String.raw`(\[[^\]]*#[0-9a-fA-F]{3,8}\b|^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$)`
const arbitraryLength = String.raw`-\[[^\]]*[0-9](px|rem)\b`

const noHardcodedStyle = ['Literal[value', 'TemplateElement[value.raw'].flatMap(
    (attribute) => [
        {
            selector: `${attribute}=/${hexColour}/]`,
            message:
                'Use a theme token (bg-primary, text-muted-foreground) instead of a hex colour; tokens live in index.css.',
        },
        {
            selector: `${attribute}=/${arbitraryLength}/]`,
            message:
                'Use a Tailwind scale value or a theme token instead of an arbitrary px/rem length.',
        },
    ],
)

export default defineConfig(
    globalIgnores([
        'dist',
        'vendor',
        'node_modules',
        'workbench',
        // Generated by the cn Vite plugin on every build.
        'resources/js/lib/cn-tables.ts',
    ]),
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    reactHooks.configs.flat.recommended,
    jsxA11y.flatConfigs.recommended,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        files: ['resources/js/**/*.{ts,tsx}'],
        languageOptions: { globals: globals.browser },
    },
    {
        files: ['**/*.{js,mjs}'],
        extends: [tseslint.configs.disableTypeChecked],
        languageOptions: { globals: globals.node },
    },

    // 1. Layers
    {
        files: ['resources/js/**/*.{ts,tsx}'],
        plugins: { boundaries },
        settings: boundariesSettings,
        rules: boundariesRules,
    },

    // 2. Conventions
    {
        files: ['resources/js/**/*.{ts,tsx}'],
        plugins: { 'check-file': checkFile },
        rules: {
            'check-file/filename-naming-convention': [
                'error',
                { 'resources/js/**/*.{ts,tsx}': 'KEBAB_CASE' },
                {
                    ignoreMiddleExtensions: true,
                    errorMessage:
                        'Name files in kebab-case ({{ target }}); .test, .catalogue and .d are allowed as a middle extension.',
                },
            ],
            'check-file/folder-match-with-fex': [
                'error',
                { '*.catalogue.tsx': 'resources/js/components/**/' },
                {
                    errorMessage:
                        'Catalogue files sit next to their component under components/ui, patterns or telemetry.',
                },
            ],
            'no-restricted-syntax': [
                'error',
                noDefaultExport,
                ...noHardcodedStyle,
            ],
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        stateLibraries,
                        {
                            group: ['..', '../**'],
                            message:
                                "Import across folders with '@/…'; relative imports are for files in the same folder.",
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['resources/js/pages/**/*.{ts,tsx}'],
        rules: {
            'max-lines': [
                'error',
                { max: 150, skipBlankLines: true, skipComments: true },
            ],
        },
    },

    // 3. Tokens do not apply to the vendored shadcn primitives.
    {
        files: ['resources/js/components/ui/**/*.{ts,tsx}'],
        rules: { 'no-restricted-syntax': ['error', noDefaultExport] },
    },
)
