/**
 * The facts a document carries in the docs sheet — its row's second line and
 * the viewer's caption: tracking, held state, source, printed count; a
 * preview says it is not linked.
 */

import { HELD_FACE } from '@/features/labels-docs/orders/pane/LabelSlot';
import { PAPERWORK_SOURCE_FACE, printedFace } from '@/features/labels-docs/orders/pane/slot-faces';
import type { ViewerItem } from './doc-selection';

export function itemFacts(item: ViewerItem): string[] {
  const facts: Array<string | null | undefined> = (() => {
    switch (item.kind) {
      case 'label':
        return [item.row.trackingNumber ?? 'No tracking read', item.filed ? null : HELD_FACE[item.row.state], printedFace(item.row.printCount)];
      case 'label-document':
        return [item.doc.trackingNumber ?? 'No tracking', printedFace(item.doc.printCount)];
      case 'slip':
        return [item.src ? printedFace(item.doc.printCount) : 'No stored file — not printable'];
      case 'paperwork':
        return [`via ${PAPERWORK_SOURCE_FACE[item.doc.association.source]}`, item.src ? printedFace(item.doc.printCount) : 'Drive only — not printable'];
      case 'preview':
        return ['Preview — not linked', item.manual.detail];
    }
  })();
  return facts.filter((fact): fact is string => Boolean(fact));
}
