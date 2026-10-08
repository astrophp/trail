/** A note beside a provider or model: it is the last failover attempt's. */
export function LastAttempt({ show }: { show: boolean }) {
    return show ? (
        <span className="ms-2 text-caption text-muted-foreground">
            last attempt
        </span>
    ) : null
}
