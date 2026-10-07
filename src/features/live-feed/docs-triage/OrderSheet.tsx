'use client';

/**
 * One order in the docs sheet: the work column (~40% — identity strip, the
 * three tabs, the tab's rows, suggestions, search and verbs) beside the
 * full-height portrait viewer (operator 2026-10-06, round 2).
 *
 * It owns the order's selection (`DocSelection`, resolved against the packet
 * every render) and the order's one label intake (`useLabelUploads` — the
 * label slot's tray, and a removed label's Undo). Mount it keyed by order.
 */

import { useEffect, useState, type MutableRefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { PaneHeaderTabs } from '@/components/ui/pane-header/PaneHeaderTabs';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { fadeInstant } from '@/design-system/motion/tokens';
import type { OrderPacket } from '@/lib/label-prints/order-packet-contracts';
import { usePacketRefresh } from '@/features/labels-docs/orders/pane/use-packet-refresh';
import { useLabelUploads } from '@/features/labels-docs/upload/use-label-uploads';
import { resolveSelection, type DocSelection } from './doc-selection';
import { DOC_TAB_LABEL, DOC_TABS, docTabCount, docTabState, type DocTab } from './doc-tabs';
import { DocMark } from './DocMark';
import { DocTabBody } from './DocTabBody';
import { DocViewer } from './DocViewer';
import { IdentityStrip } from './IdentityStrip';
import type { SheetPlace } from './sheet-model';

/** The tab body's ~150 ms slide-fade; reduced motion keeps the fade only. */
const TAB_BODY = { initial: { opacity: 0, x: 8 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -8 } };

/** What the sheet's keyboard reaches inside the open order: ⌘↵ links the preview; Esc clears the selection first. */
export interface SheetKeys {
  /** Link the previewed document; null when nothing linkable shows. */
  link: (() => void) | null;
  /** Clear the viewer's selection; false when there was none (Esc then closes the sheet). */
  clearSelection: () => boolean;
}

export function OrderSheet({
  packet,
  rows,
  tab,
  onTab,
  onGo,
  keys,
}: {
  packet: OrderPacket;
  /** Every order of the selection, rail order. */
  rows: readonly OrderPacket[];
  tab: DocTab;
  onTab: (tab: DocTab) => void;
  /** Open another order × tab (Next owed). */
  onGo: (place: SheetPlace) => void;
  keys: MutableRefObject<SheetKeys>;
}) {
  const refresh = usePacketRefresh();
  const uploads = useLabelUploads({ targetOrderId: packet.orderId, targetOrderRef: packet.orderRef, onSettled: refresh });
  const [selection, setSelection] = useState<DocSelection | null>(null);
  // The tab a Link last landed on (since the selection changed) — Next owed shows there only.
  const [linkedOn, setLinkedOn] = useState<DocTab | null>(null);
  const current = resolveSelection(packet, tab, selection);
  const presence = useMotionPresence(TAB_BODY);
  const transition = useMotionTransition(fadeInstant);
  const select = (next: DocSelection | null) => {
    setSelection(next);
    setLinkedOn(null);
  };

  useEffect(() => {
    keys.current.clearSelection = () => {
      if (selection == null) return false;
      select(null);
      return true;
    };
  });
  useEffect(() => () => {
    keys.current = { link: null, clearSelection: () => false };
  }, [keys]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1" data-testid="live-feed-print-dialog-pane">
      <div className="flex min-h-0 w-2/5 min-w-[26rem] shrink-0 flex-col border-r border-border-soft" data-testid="docs-work-column">
        <IdentityStrip packet={packet} />
        <div className="border-b border-border-soft px-4 py-2">
          <PaneHeaderTabs
            ariaLabel="Document type"
            value={tab}
            onChange={onTab}
            tabs={DOC_TABS.map((each) => ({
              value: each,
              count: docTabCount(packet, each),
              label: (
                <span className="inline-flex items-center gap-1.5" data-testid={`docs-tab-trigger-${each}`}>
                  <DocMark state={docTabState(packet, each)} title={docTabState(packet, each)} />
                  {DOC_TAB_LABEL[each]}
                </span>
              ),
            }))}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={tab} initial={presence.initial} animate={presence.animate} exit={presence.exit} transition={transition}>
              <DocTabBody tab={tab} packet={packet} current={current} onSelect={select} uploads={uploads} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <DocViewer
        item={current}
        tab={tab}
        packet={packet}
        rows={rows}
        uploads={uploads}
        justLinked={linkedOn === tab}
        onLinked={() => setLinkedOn(tab)}
        registerLink={(run) => {
          keys.current.link = run;
        }}
        onGo={onGo}
      />
    </div>
  );
}
