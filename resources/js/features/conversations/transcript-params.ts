import { stringParam, type Param } from '@/lib/url-state'

/** "Show tools" is on unless the URL says `tools=0`. */
const toolsParam: Param<boolean> = {
    default: true,
    parse: (raw) => (raw === '1' ? true : raw === '0' ? false : undefined),
    serialize: (value) => (value ? '1' : '0'),
}

/**
 * What the conversation page keeps in the URL: the conversation's id (any string the host
 * application chose, so it travels in the query) and whether the tool calls of each turn are
 * shown. No time range and no run filter applies to a conversation's page.
 */
export const transcriptParams = {
    id: stringParam(),
    tools: toolsParam,
}
