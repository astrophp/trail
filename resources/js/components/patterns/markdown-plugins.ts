import type { Element, ElementContent, Root as HastRoot } from 'hast'
import type { Root as MdastRoot, RootContent } from 'mdast'

/**
 * Raw HTML in an answer is kept as the text it is: `<script>` reads as `<script>` and nothing in
 * it is ever parsed as an element.
 */
export function remarkHtmlAsText() {
    return (tree: MdastRoot) => {
        const visit = (node: MdastRoot | RootContent) => {
            if (node.type === 'html') {
                ;(node as unknown as { type: string }).type = 'text'

                return
            }

            if ('children' in node) {
                node.children.forEach(visit)
            }
        }

        visit(tree)
    }
}

/**
 * Every occurrence of `sentinel` in a text, including the text of a code span or block, becomes
 * a `span` the components draw as a redaction marker.
 */
export function rehypeMarkers(sentinel: string) {
    return (tree: HastRoot) => {
        if (sentinel === '') {
            return
        }

        const visit = (node: HastRoot | Element) => {
            node.children = node.children.flatMap((child): ElementContent[] => {
                if (child.type === 'element') {
                    visit(child)

                    return [child]
                }

                if (child.type !== 'text' || !child.value.includes(sentinel)) {
                    return [child as ElementContent]
                }

                return child.value
                    .split(sentinel)
                    .flatMap((piece, index): ElementContent[] => [
                        ...(index > 0
                            ? [
                                  {
                                      type: 'element',
                                      tagName: 'span',
                                      properties: {
                                          dataRedaction: '',
                                      },
                                      children: [],
                                  } satisfies Element,
                              ]
                            : []),
                        ...(piece === ''
                            ? []
                            : [{ type: 'text', value: piece } as const]),
                    ])
            })
        }

        visit(tree)
    }
}

/** The text inside a hast node, with `sentinel` where a redaction marker stands. */
export function textOf(
    node: ElementContent | Element | undefined,
    sentinel: string,
): string {
    if (node === undefined) {
        return ''
    }

    if (node.type === 'text') {
        return node.value
    }

    if (node.type !== 'element') {
        return ''
    }

    return 'dataRedaction' in node.properties
        ? sentinel
        : node.children.map((child) => textOf(child, sentinel)).join('')
}
