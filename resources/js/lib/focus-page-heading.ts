/**
 * Moves keyboard focus to the page's heading, or to the main region when the page has none.
 * Scrolling is left alone: whoever calls this decides about scrolling.
 *
 * `main` defaults to the shell's main region (`#content`). Both the shell, after a page
 * change, and a page that removes the control that had focus, use this one function.
 */
export function focusPageHeading(
    main: HTMLElement | null = document.getElementById('content'),
): void {
    const target = main?.querySelector<HTMLElement>('h1') ?? main

    target?.focus({ preventScroll: true })
}
