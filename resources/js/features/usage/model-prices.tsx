import { useRef } from 'react'
import { failureMessage } from '@/api/client'
import { CountTabs } from '@/components/patterns/count-tabs'
import { HistorySearchField } from '@/components/patterns/history-search-field'
import { Notice } from '@/components/patterns/notice'
import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelEmpty } from '@/components/patterns/panel-empty'
import { PanelError } from '@/components/patterns/panel-error'
import { PanelHeader } from '@/components/patterns/panel-header'
import { PanelLoading } from '@/components/patterns/panel-loading'
import { RefreshNote } from '@/components/patterns/refresh-note'
import { PriceTable } from '@/features/usage/price-table'
import { pricesHeadingId } from '@/features/usage/prices-anchor'
import { useLeaveWarning } from '@/features/usage/use-leave-warning'
import { usePriceEditor } from '@/features/usage/use-price-editor'
import {
    usePriceView,
    priceTabs,
    type PriceTab,
} from '@/features/usage/use-price-view'
import { usePrices } from '@/features/usage/use-prices'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { useQueryStatus } from '@/hooks/use-query-status'
import { formatCount } from '@/lib/format'

const isTab = (value: string): value is PriceTab =>
    priceTabs.some((tab) => tab === value)

/**
 * The rates of the models Trail knows, and where a developer sets them. Trail is not a billing
 * system: a saved price applies to runs recorded from now on and never changes a cost already
 * recorded, which the panel says once. Models are never added here; they come from the
 * configuration and from recorded usage.
 */
export function ModelPrices({ className }: { className?: string }) {
    const query = usePrices()
    const { data, isError, isFetching, refetch } = query
    const { failed, retrying, failure, loading } = useQueryStatus(
        query,
        'prices',
    )
    const prices = data?.data
    const editor = usePriceEditor(prices)
    const view = usePriceView(prices)
    const filterRef = useRef<HTMLInputElement>(null)

    useLeaveWarning(editor.unsaved)
    // The retry button, or the one of the refresh note, goes away when the list loads.
    useFocusHandoff(failed || (isError && data !== undefined))

    const refreshing = data !== undefined && isFetching

    return (
        <section aria-labelledby={pricesHeadingId} className={className}>
            {/* Always mounted, so a change of its text is announced. */}
            <span role="status" className="sr-only">
                {refreshing ? 'Refreshing the model prices' : ''}
            </span>
            {data !== undefined && isError ? (
                <RefreshNote
                    refreshing="ended"
                    failed
                    onRetry={() => void refetch()}
                />
            ) : null}
            <Panel>
                <PanelHeader
                    title="Model prices"
                    titleTarget={{ id: pricesHeadingId }}
                    description={
                        <>
                            <span className="block">
                                A price you save applies to runs recorded from
                                now on. Costs already recorded stay as they
                                were.
                            </span>
                            <span className="block">
                                A long-running worker can take up to a minute to
                                pick up a new price.
                            </span>
                        </>
                    }
                />
                <PanelContent className="p-0">
                    {failed ? (
                        <PanelError
                            title="The model prices could not be loaded"
                            message={failureMessage(failure)}
                            onRetry={() => {
                                if (!retrying) {
                                    void refetch()
                                }
                            }}
                        />
                    ) : loading || data === undefined ? (
                        <PanelLoading rows={4} className="p-5" />
                    ) : data.data.length === 0 ? (
                        <PanelEmpty
                            title="No models yet"
                            description="Models come from your Trail configuration and from recorded usage, and there are none of either."
                        />
                    ) : (
                        <>
                            {data.limit.truncated ? (
                                <Notice
                                    tone="warning"
                                    title="Only part of the list is shown"
                                    className="mx-5 mb-4"
                                >
                                    Trail lists {formatCount(data.limit.limit)}{' '}
                                    of {formatCount(data.limit.total)} models,
                                    those seen in usage first, so some are not
                                    shown.
                                </Notice>
                            ) : null}
                            <p className="px-5 pb-3 text-caption text-muted-foreground">
                                US dollars per million tokens. Models come from
                                your Trail configuration and recorded usage.
                            </p>
                            <CountTabs
                                aria-label="Which models to list"
                                tabs={[
                                    {
                                        value: 'seen',
                                        label: 'Seen in usage',
                                        count: view.counts.seen,
                                    },
                                    {
                                        value: 'all',
                                        label: 'All models',
                                        count: view.counts.all,
                                    },
                                ]}
                                value={view.tab}
                                onValueChange={(next) => {
                                    if (isTab(next)) {
                                        view.setTab(next)
                                    }
                                }}
                                className="[&_[role=tablist]]:px-5"
                                toolbar={
                                    <div className="px-5 py-3">
                                        <HistorySearchField
                                            value={view.find}
                                            onCommit={view.setFind}
                                            inputRef={filterRef}
                                            placeholder="Filter by provider or model"
                                            aria-label="Filter the models by provider or model"
                                        />
                                    </div>
                                }
                            >
                                {view.shown.length === 0 ? (
                                    <PanelEmpty
                                        title={
                                            view.find !== ''
                                                ? 'No model matches the filter'
                                                : 'No model has been seen in usage yet'
                                        }
                                        description={
                                            view.find !== ''
                                                ? 'Clear the filter, or try another provider or model.'
                                                : 'Recorded steps and embeddings will list their models here. All models shows the ones from your configuration.'
                                        }
                                    />
                                ) : (
                                    <PriceTable
                                        prices={view.shown}
                                        editor={editor}
                                    />
                                )}
                            </CountTabs>
                        </>
                    )}
                </PanelContent>
            </Panel>
        </section>
    )
}
