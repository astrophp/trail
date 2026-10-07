import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The dashboard ships as two committed files that the Blade layout inlines
// (the Horizon/Telescope method), so the build must never split chunks.
export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        tsconfigPaths: true,
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
        setupFiles: ['resources/js/test/setup.ts'],
        include: ['resources/js/**/*.test.{ts,tsx}'],
    },
})
