'use client';

/**
 * The viewer's linking verbs: Link for a previewed library document (pairs at
 * the line's default scope, SKU first, naming its reach; ⌘↵ / Ctrl+Enter),
 * and — once a manual is linked — Also link it to the selection's other orders
 * owing paperwork on the same SKU. Both go through the order-manual pair
 * writer; each success toasts with Undo.
 */

import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { Button } from '@/design-system/primitives/Button';
import type { OrderPacket, OrderPacketLine } from '@/lib/label-prints/order-packet-contracts';
import { defaultPairScope, type PaperworkPairing, type PaperworkSource } from '@/lib/manuals/paperwork-pairing';
import { pairOrderManual } from '@/lib/orders/order-paperwork-client';
import { toast } from '@/lib/toast';
import { usePacketRefresh } from '@/features/labels-docs/orders/pane/use-packet-refresh';
import { restorePairing, useLinePaperwork } from '@/features/labels-docs/orders/pane/use-line-paperwork';
import { linkVerbLabel, type ViewerItem } from './doc-selection';
import { useUndo } from './doc-verbs';

/**
 * The viewer's Link for a previewed library document. `register` hands the
 * sheet its run for ⌘↵ / Ctrl+Enter while it shows; `onLinked` fires on success.
 */
export function LinkVerb({
  item,
  register,
  onLinked,
}: {
  item: Extract<ViewerItem, { kind: 'preview' }>;
  register?: (run: (() => void) | null) => void;
  onLinked?: () => void;
}) {
  const writes = useLinePaperwork(item.line);
  const scope = defaultPairScope(item.line);
  const run = () => {
    if (!writes.pair.isPending) writes.pair.mutate({ manualId: item.manual.manualId, scope }, { onSuccess: () => onLinked?.() });
  };
  useEffect(() => {
    register?.(run);
    return () => register?.(null);
  });
  return (
    <Button
      type="button"
      variant="primary"
      size="sm"
      radius="control"
      icon={<Link2 />}
      loading={writes.pair.isPending}
      aria-keyshortcuts="Meta+Enter Control+Enter"
      title="⌘↵ / Ctrl+Enter"
      onClick={run}
      data-testid="docs-viewer-link"
    >
      {linkVerbLabel(scope, item.line, writes.reach)}
    </Button>
  );
}

/**
 * After one manual is linked: link it to the other orders of the selection
 * that owe paperwork on the same SKU, each line at its own default scope.
 * One Undo puts every line back as it was.
 */
export function AlsoLinkVerb({
  manualId,
  sku,
  others,
}: {
  manualId: number;
  sku: string;
  others: ReadonlyArray<{ packet: OrderPacket; line: OrderPacketLine }>;
}) {
  const refresh = usePacketRefresh();
  const undo = useUndo();
  const link = useMutation({
    mutationFn: async () => {
      const done: Array<{ lineId: number; before: PaperworkPairing; scope: PaperworkSource }> = [];
      for (const { line } of others) {
        const scope = defaultPairScope(line);
        const { before } = await pairOrderManual(line.orderLineId, manualId, scope);
        done.push({ lineId: line.orderLineId, before, scope });
      }
      return done;
    },
    onSuccess: (done) => {
      toast.undo(`Linked to ${done.length} more order${done.length === 1 ? '' : 's'} with SKU ${sku}`, {
        onUndo: undo(
          () => Promise.all(done.map(({ lineId, before, scope }) => restorePairing(lineId, manualId, before, scope))),
          'Extra links undone',
        ),
      });
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: refresh,
  });
  if (others.length === 0) return null;
  return (
    <Button type="button" variant="secondary" size="sm" radius="control" icon={<Link2 />} loading={link.isPending} onClick={() => link.mutate()} data-testid="docs-viewer-also-link">
      Also link to the other {others.length} order{others.length === 1 ? '' : 's'} with SKU {sku} in this selection
    </Button>
  );
}
