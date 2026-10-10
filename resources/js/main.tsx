import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/app'
import { boot } from '@/lib/boot'
import './index.css'

const root = document.getElementById('trail')

if (root) {
    createRoot(root).render(
        <StrictMode>
            <App boot={boot()} />
        </StrictMode>,
    )
}
