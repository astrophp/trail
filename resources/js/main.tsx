import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '@/components/ui/button'
import './index.css'

const root = document.getElementById('trail')

if (root) {
    createRoot(root).render(
        <StrictMode>
            <main className="flex items-center gap-4 p-6">
                <h1 className="text-xl font-semibold">Trail</h1>
                <Button>Button</Button>
            </main>
        </StrictMode>,
    )
}
