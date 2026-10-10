import { MetricStripSkeleton } from '@/components/patterns/metric-strip-skeleton'
import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelLoading } from '@/components/patterns/panel-loading'

/**
 * The place of an agent's page while its first answer is on the way: the strip, the chart and the
 * list of what needs a look, as the page will lay them out. The models and tools are drawn by
 * their own request, and say they are loading themselves.
 */
export function AgentSkeleton({ className }: { className?: string }) {
    return (
        <div data-slot="agent-skeleton" className={className}>
            <MetricStripSkeleton count={4} />
            <div className="mt-6 flex flex-col gap-4">
                <Panel>
                    <PanelContent className="pt-5">
                        <PanelLoading rows={6} />
                    </PanelContent>
                </Panel>
                <Panel>
                    <PanelContent className="pt-5">
                        <PanelLoading rows={3} />
                    </PanelContent>
                </Panel>
            </div>
        </div>
    )
}
