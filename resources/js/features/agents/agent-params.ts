import { activityParams } from '@/components/telemetry/activity-mode'
import { stringParam } from '@/lib/url-state'

/**
 * What an agent's page keeps in the URL besides the time range: the agent's name, which is any
 * text the application chose and so is read as the address spells it (nothing trims it), and the
 * mode of the activity chart.
 */
export const agentPageParams = {
    name: stringParam(),
    ...activityParams,
}
