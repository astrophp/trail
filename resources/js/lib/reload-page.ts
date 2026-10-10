/** Reloads the page, which gets a fresh CSRF token and lets the application send the person to its sign-in. */
export function reloadPage(): void {
    window.location.reload()
}
