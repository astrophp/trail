type NavigatorWithData = Navigator & { userAgentData?: { platform?: string } }

/**
 * Whether the person is on an Apple platform (macOS, iPadOS, iOS), where the command key is the
 * shortcut modifier; elsewhere it is Control. Read from the browser each time it is asked, so a
 * test can change it.
 */
export function isApplePlatform(): boolean {
    const nav: NavigatorWithData | undefined =
        typeof navigator === 'undefined' ? undefined : navigator
    const platform = nav?.userAgentData?.platform ?? nav?.platform ?? ''

    return /mac|iphone|ipad|ipod/i.test(platform)
}
