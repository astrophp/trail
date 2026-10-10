import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Key-value list',
    specimens: [
        {
            name: 'One column',
            Component: () => (
                <KeyValueList>
                    <KeyValue label="Model">gpt-5</KeyValue>
                    <KeyValue label="Provider">openai</KeyValue>
                    <KeyValue label="Attempts">3</KeyValue>
                </KeyValueList>
            ),
        },
        {
            name: 'Two columns on wide screens',
            Component: () => (
                <KeyValueList columns="two">
                    <KeyValue label="Model">gpt-5</KeyValue>
                    <KeyValue label="Provider">openai</KeyValue>
                    <KeyValue label="Attempts">3</KeyValue>
                    <KeyValue label="Finish reason">stop</KeyValue>
                </KeyValueList>
            ),
        },
        {
            name: 'Rows: a label column and a value column',
            Component: () => (
                <KeyValueList layout="rows" className="max-w-xl">
                    <KeyValue
                        label="Span id"
                        copy="019a3f2c-7d10-7e55-a1b2-3c4d5e6f7a8b"
                    >
                        <span className="font-mono">
                            019a3f2c-7d10-7e55-a1b2-3c4d5e6f7a8b
                        </span>
                    </KeyValue>
                    <KeyValue label="Provider">openai</KeyValue>
                    <KeyValue label="Input tokens">1,200</KeyValue>
                    <KeyValue label="Cache read" nested>
                        800
                    </KeyValue>
                    <KeyValue label="Responding model" missing="Pending" />
                </KeyValueList>
            ),
        },
        {
            name: 'With a copy button',
            Component: () => (
                <KeyValueList>
                    <KeyValue
                        label="Trace id"
                        copy="019a3f2c-7d10-7e55-a1b2-3c4d5e6f7a8b"
                    >
                        019a3f2c-7d10-7e55-a1b2-3c4d5e6f7a8b
                    </KeyValue>
                </KeyValueList>
            ),
        },
        {
            name: 'Missing, default and custom words',
            Component: () => (
                <KeyValueList>
                    <KeyValue label="Model" />
                    <KeyValue label="Cost" missing="Unpriced" />
                </KeyValueList>
            ),
        },
        {
            name: 'A long value wraps',
            Component: () => (
                <div className="max-w-xs">
                    <KeyValueList>
                        <KeyValue
                            label="Class"
                            copy="App\Ai\Agents\SomeVeryLongAgentNameThatKeepsGoing"
                        >
                            App\Ai\Agents\SomeVeryLongAgentNameThatKeepsGoingAndGoing
                        </KeyValue>
                    </KeyValueList>
                </div>
            ),
        },
    ],
}
