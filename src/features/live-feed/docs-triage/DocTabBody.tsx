'use client';

/**
 * One tab of the docs sheet's work column, for one order (operator
 * 2026-10-06, round 2 — the document itself shows in the viewer beside it):
 *
 *   on file   every document of the tab as a row — pressing it shows it in the
 *             viewer; its verbs (Unpair / Unlink / Remove …) sit on the row
 *   owed      the order pane's own slots, opened for the job, so every write
 *             stays the one writer it already is (`LabelSlot`, `SlipSlot`,
 *             `LinePaperworkSlot`); the label slot's Buy label opens the
 *             detailed label-buy form in the viewer column (`buying`)
 *
 * Product paperwork is per line: what is linked, then the library's
 * likeliest documents, then a library search — pressing any of them
 * previews it in the viewer; the viewer's Link pairs it.
 */

import type { LabelBuyPurpose } from '@/components/outbound/labels/replacement/ReplacementForm';
import { isPacketGap, type OrderPacket, type OrderPacketLine } from '@/lib/label-prints/order-packet-contracts';
import { LabelSlot } from '@/features/labels-docs/orders/pane/LabelSlot';
import { LinePaperworkSlot } from '@/features/labels-docs/orders/pane/LinePaperworkSlot';
import { SlipSlot } from '@/features/labels-docs/orders/pane/SlipSlot';
import type { LabelPageUploads } from '@/features/labels-docs/upload/use-label-uploads';
import { linkedItems, selectionOf, type DocSelection, type LinkedItem, type PreviewManual, type ViewerItem } from './doc-selection';
import type { DocTab } from './doc-tabs';
import { DocVerbs } from './doc-verbs';
import { itemFacts } from './item-facts';
import { LibrarySearch } from './LibrarySearch';
import { PaperworkSuggestions } from './PaperworkSuggestions';
import { SheetRow, SheetThumb } from './SheetRow';

interface Shared {
  packet: OrderPacket;
  /** What the viewer shows now. */
  current: ViewerItem | null;
  onSelect: (selection: DocSelection) => void;
  /** The order's one label intake (the slot's tray and its waiting pages, a removed label's Undo). */
  uploads: LabelPageUploads;
}

function LinkedList({ items, packet, current, onSelect, uploads, label }: Shared & { items: LinkedItem[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex min-w-0 flex-col gap-0.5" aria-label={label} data-testid="docs-linked">
      {items.map((item) => (
        <SheetRow
          key={item.key}
          testId={`docs-linked-${item.kind}`}
          selected={current?.key === item.key}
          onSelect={() => onSelect(selectionOf(item))}
          thumb={<SheetThumb alt="" />}
          title={item.title}
          meta={itemFacts(item).join(' · ')}
          aside={<DocVerbs item={item} packet={packet} uploads={uploads} face="row" />}
        />
      ))}
    </ul>
  );
}

function PaperworkLine({ line, ...shared }: Shared & { line: OrderPacketLine }) {
  const { packet, current, onSelect } = shared;
  const items = linkedItems(packet, 'paperwork').filter((item) => item.kind === 'paperwork' && item.line.orderLineId === line.orderLineId);
  const preview = (manual: PreviewManual) => onSelect({ kind: 'preview', lineId: line.orderLineId, manual });
  return (
    <LinePaperworkSlot packet={packet} line={line} placement="sheet">
      <div className="mt-1 min-w-0">
        <LinkedList {...shared} items={items} label={`Linked to ${line.sku ? `SKU ${line.sku}` : line.title}`} />
      </div>
      {isPacketGap(line.state) ? <PaperworkSuggestions line={line} current={current} onPreview={preview} /> : null}
      {line.state !== 'not_required' ? <LibrarySearch line={line} current={current} onPreview={preview} /> : null}
    </LinePaperworkSlot>
  );
}

export function DocTabBody({
  tab,
  buying,
  onBuy,
  ...shared
}: Shared & {
  tab: DocTab;
  /** The label buy open in the viewer column, if any. */
  buying: LabelBuyPurpose | null;
  onBuy: (purpose: LabelBuyPurpose | null) => void;
}) {
  const { packet, uploads } = shared;

  if (tab === 'paperwork') {
    return (
      <div className="flex min-w-0 flex-col gap-3 p-4" data-testid="docs-tab-paperwork">
        {packet.lines.length === 0 ? (
          <p className="text-role-caption text-text-muted">This order has no product lines.</p>
        ) : (
          <div className="flex min-w-0 flex-col divide-y divide-border-hairline rounded-xl border border-border-soft">
            {packet.lines.map((line) => (
              <PaperworkLine key={line.orderLineId} {...shared} line={line} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 p-4" data-testid={`docs-tab-${tab}`}>
      <LinkedList {...shared} items={linkedItems(packet, tab)} label={tab === 'label' ? 'Shipping labels on file' : 'Packing slips on file'} />
      <div className="min-w-0 rounded-xl border border-border-soft">
        {tab === 'label' ? <LabelSlot packet={packet} sheet={{ uploads, buying, onBuy }} /> : <SlipSlot packet={packet} sheet />}
      </div>
    </div>
  );
}
