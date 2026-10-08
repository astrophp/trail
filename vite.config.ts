import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { cn } from 'cn/vite'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// The dashboard ships as two committed files that the Blade layout inlines
// (the Horizon/Telescope method), so the build must never split chunks.
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        // Compiles the class-merging tables from our sources and the theme in index.css.
        cn({
            // The catalogue serves from its own folder; scan the project either way.
            cwd: import.meta.dirname,
            content: ['resources/js/**/*.{ts,tsx}'],
            out: 'resources/js/lib/cn-tables.ts',
        }),
    ],
    resolve: {
        tsconfigPaths: true,
        // The shadcn CLI writes `import { cn } from "cn"` into components/ui; send those
        // to our own cn() (lib/utils.ts), which knows the theme.
        alias: [
            {
                find: /^cn$/,
                replacement: resolve(
                    import.meta.dirname,
                    'resources/js/lib/utils.ts',
                ),
            },
        ],
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        cssCodeSplit: false,
        rolldownOptions: {
            input: 'resources/js/main.tsx',
            output: {
                entryFileNames: 'app.js',
                assetFileNames: 'app.[ext]',
                codeSplitting: false,
            },
        },
    },
    test: {
        environment: 'jsdom',
        // Room for a render under load; see `asyncUtilTimeout` in the test setup.
        testTimeout: 15_000,
        setupFiles: ['resources/js/test/setup.ts'],
        include: ['resources/js/**/*.test.{ts,tsx}'],
    },
})
