/**
 * remark plugin: split prose text into reference nodes (`scanDocRefs`) that
 * render as `<docref kind value>` — the live chips (`DocRefChip`). Text inside
 * links, inline code and code blocks is left alone: a link already names its
 * target and code is literal.
 */

import { scanDocRefs } from '@/lib/tasks/doc-live';

/** The mdast slice this plugin reads (mdast types are not a direct dependency). */
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, string> };
}

/** The element name the renderer maps to `DocRefChip`. */
export const DOC_REF_TAG = 'docref';

const SKIP: Readonly<Record<string, true>> = {
  link: true,
  linkReference: true,
  inlineCode: true,
  code: true,
  html: true,
  definition: true,
};

function splitText(node: MdNode): MdNode[] {
  const text = node.value ?? '';
  const matches = scanDocRefs(text);
  if (matches.length === 0) return [node];
  const out: MdNode[] = [];
  let at = 0;
  for (const m of matches) {
    if (m.start > at) out.push({ type: 'text', value: text.slice(at, m.start) });
    out.push({
      type: 'docRef',
      // An unknown mdast node with `hName` becomes that element (mdast-util-to-hast).
      data: { hName: DOC_REF_TAG, hProperties: { kind: m.ref.kind, value: m.ref.value } },
      children: [{ type: 'text', value: m.raw }],
    });
    at = m.end;
  }
  if (at < text.length) out.push({ type: 'text', value: text.slice(at) });
  return out;
}

function walk(node: MdNode): void {
  if (!node.children || SKIP[node.type]) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === 'text') return splitText(child);
    walk(child);
    return [child];
  });
}

export function remarkDocRefs() {
  return (tree: MdNode) => walk(tree);
}
