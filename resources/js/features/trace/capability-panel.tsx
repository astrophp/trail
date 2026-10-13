import { cn } from '@/lib/utils'
import type { Span } from '@/api/types'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import { StoredPayload } from '@/components/telemetry/stored-payload'
import { asArray, asObject } from '@/lib/payload-access'
import { WholeInput } from '@/components/telemetry/whole-input'
import { WholeOutput } from '@/features/trace/whole-output'

/** Provider order, original document indexes, and every stored answer field stay visible. */
export function CapabilityPanel({
    span,
    side,
    className,
}: {
    span: Span
    side: 'input' | 'output'
    className?: string
}) {
    const value = asObject(span[side])
    const classification = span.type === 'classification'
    const itemField = classification
        ? side === 'input'
            ? 'questions'
            : 'answers'
        : side === 'input'
          ? 'documents'
          : 'results'
    const countField = classification
        ? side === 'input'
            ? 'question_count'
            : 'answer_count'
        : side === 'input'
          ? 'document_count'
          : 'result_count'
    const known = classification
        ? side === 'input'
            ? [
                  countField,
                  'attachment_count',
                  'questions',
                  'state',
                  'attachments',
                  'omitted_entries',
              ]
            : [countField, 'answers', 'omitted_entries']
        : side === 'input'
          ? [countField, 'limit', 'query', 'documents', 'omitted_entries']
          : [countField, 'results', 'omitted_entries']
    const storedItems = value?.[itemField]
    const items = classification ? asObject(storedItems) : asArray(storedItems)
    if (
        value === null ||
        typeof value[countField] !== 'number' ||
        Object.keys(value).some((key) => !known.includes(key)) ||
        (storedItems !== null && storedItems !== undefined && items === null)
    ) {
        return side === 'input' ? (
            <WholeInput span={span} />
        ) : (
            <WholeOutput span={span} />
        )
    }
    const entries = items === null ? [] : Object.entries(items)
    const payload = (key: string, label: string) =>
        value[key] === undefined ? null : (
            <StoredPayload
                key={key}
                span={span}
                path={`${side}.${key}`}
                label={label}
                value={value[key]}
            />
        )
    return (
        <div className={cn('flex flex-col gap-6', className)}>
            <KeyValueList layout="rows">
                <KeyValue
                    label={
                        classification
                            ? side === 'input'
                                ? 'Questions'
                                : 'Answers'
                            : side === 'input'
                              ? 'Documents'
                              : 'Results'
                    }
                >
                    {typeof value[countField] === 'number'
                        ? value[countField]
                        : null}
                </KeyValue>
                {side === 'input' && !classification ? (
                    <KeyValue label="Requested limit" missing="All documents">
                        {typeof value.limit === 'number' ? value.limit : null}
                    </KeyValue>
                ) : null}
                {side === 'input' && classification ? (
                    <KeyValue label="Attachments" missing="Not reported">
                        {typeof value.attachment_count === 'number'
                            ? value.attachment_count
                            : null}
                    </KeyValue>
                ) : null}
            </KeyValueList>
            {side === 'input'
                ? payload(
                      classification ? 'state' : 'query',
                      classification ? 'State' : 'Query',
                  )
                : null}
            {entries.length === 0 ? (
                <p className="text-ui text-muted-foreground">
                    No {itemField} content was stored.
                </p>
            ) : (
                entries.map(([key, item], order) => {
                    const object = asObject(item)
                    const index = object?.index
                    const label = classification
                        ? `${side === 'input' ? 'Question' : 'Answer'}: ${key}`
                        : typeof index === 'number'
                          ? `${side === 'output' ? `Rank ${order + 1} · ` : ''}Document index ${index}`
                          : `Stored ${itemField} ${key}`
                    return (
                        <section key={key} className="flex flex-col gap-3">
                            <h3 className="text-ui font-medium wrap-anywhere">
                                {label}
                            </h3>
                            {classification &&
                            side === 'output' &&
                            object?.type === 'boolean' ? (
                                <p className="text-caption text-muted-foreground">
                                    Probability of true, as reported by the
                                    provider.
                                </p>
                            ) : null}
                            {!classification && side === 'output' ? (
                                <p className="text-caption text-muted-foreground">
                                    Provider relevance score; not a probability.
                                </p>
                            ) : null}
                            <StoredPayload
                                span={span}
                                path={`${side}.${itemField}.${key}`}
                                label={label}
                                value={item}
                            />
                        </section>
                    )
                })
            )}
            {payload('attachments', 'Attachment descriptors')}
            {typeof value.omitted_entries === 'number' &&
            value.omitted_entries > 0 ? (
                <p role="note" className="text-caption text-muted-foreground">
                    {value.omitted_entries} entries omitted by capture limits.
                    Counts include omitted entries.
                </p>
            ) : null}
            {span.type === 'reranking' &&
            side === 'input' &&
            entries.length > 0 ? (
                <p className="text-caption text-muted-foreground">
                    Document snippets are bounded to 1,000 characters. Indexes
                    refer to the original input order.
                </p>
            ) : null}
        </div>
    )
}
