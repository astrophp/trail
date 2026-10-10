import { toast } from 'sonner'

// An error is worth more time to read, and to react to, than a confirmation.
const errorDuration = 8000

/**
 * Tells the person the outcome of something they did, in the `Toaster` mounted once in the app.
 * The app's one import for toasts. Sonner announces them politely; an error stays longer.
 */
export const notify = {
    success(text: string) {
        toast.success(text)
    },
    error(text: string) {
        toast.error(text, { duration: errorDuration })
    },
}
