'use client';

/**
 * GlobalDetailStackHost — opens detail slide-overs from anywhere (assistant
 * recents, future global search actions) without navigating away from the
 * operator's current page or mode. Renders into the shared RightRailHost slot
 * via each panel's DetailStackRailRegistrar.
 *
 * **Exactly ONE registrar is mounted at a time** — the loading shell OR the one
 * resolved panel, never both. Two registrars rendered as siblings evict each
 * other from the single RightRailHost slot, so the early return below (`loading
 * || !loaded`) is a correctness boundary, not a formatting choice.
 *
 * The panels themselves own their band (Back · title · host close cell); this
 * host only decides which one is on screen, plus the placeholder band below.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskInspectorIndexShell } from '@/components/right-rail/DeskInspectorIndexShell';
import { loadDetailStack, type LoadedDetailStack } from '@/lib/detail-stacks/load-detail-stack';
import {
  closeDetailStack,
  getActiveDetailStack,
  subscribeActiveDetailStack,
} from '@/lib/detail-stacks/open-store';
import { cartonReadHref } from '@/lib/receiving/surface-path';
import { dispatchDashboardAndStationRefresh } from '@/utils/events';
import { toast } from '@/lib/toast';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';

const CompactOrderPeek = dynamic(
  () => import('@/components/order-record/CompactOrderPeek').then((m) => m.CompactOrderPeek),
  { ssr: false },
);
const FbaBoardDetailPanel = dynamic(
  () => import('@/components/fba/FbaBoardDetailPanel').then((m) => m.FbaBoardDetailPanel),
  { ssr: false },
);
const RepairDetailsPanel = dynamic(
  () => import('@/components/repair/RepairDetailsPanel').then((m) => m.RepairDetailsPanel),
  { ssr: false },
);

/**
 * The half-second placeholder before the real inspector mounts.
 *
 * It wears the SAME band as the panel it hands off to (2026-08-21) — a bare
 * spinner in the rail had no title row at all, so the host's `⤢` / `✕` floated
 * over a blank column and the band appeared to arrive late. `standalone`
 * because this shell is not routed through an index: it is opened straight from
 * a global action (assistant recents), so it owes no Back.
 */
function DetailStackLoadingShell({ stackId, onClose }: { stackId: string; onClose: () => void }) {
  return (
    // Non-modal like every panel it hands off to — otherwise the half-second
    // spinner flashes a scrim + scroll lock that the real inspector immediately
    // takes back down, which reads as the page blinking.
    <DetailStackRailRegistrar
      id={`detail:global:${stackId}`}
      onClose={onClose}
      modal={false}
      ariaLabel="Loading details"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card">
        <DeskInspectorIndexShell
          stance="standalone"
          title="Details"
          ariaLabel="Loading details"
          testId="global-detail-stack-loading"
          body={<UniversalLoader isLoading label="Loading details" className="h-full" />}
        />
      </div>
    </DetailStackRailRegistrar>
  );
}

export function GlobalDetailStackHost() {
  const router = useRouter();
  const active = useSyncExternalStore(subscribeActiveDetailStack, getActiveDetailStack, () => null);
  const [loaded, setLoaded] = useState<LoadedDetailStack | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClose = useCallback(() => {
    closeDetailStack();
    setLoaded(null);
  }, []);

  const handleUpdate = useCallback(() => {
    dispatchDashboardAndStationRefresh();
  }, []);

  // Decision 2a: receiving "look" lands on the read inspector — never remount
  // editable ReceivingDetailsStack from the global host.
  useEffect(() => {
    if (!active || active.kind !== 'receiving') return;
    const id = Number(active.id);
    closeDetailStack();
    setLoaded(null);
    if (Number.isFinite(id) && id > 0) {
      router.push(cartonReadHref(id));
    }
  }, [active, router]);

  useEffect(() => {
    if (!active) {
      setLoaded(null);
      setLoading(false);
      return;
    }
    if (active.kind === 'receiving') return;

    let cancelled = false;
    setLoading(true);
    setLoaded(null);

    void loadDetailStack(active).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.kind === 'missing') {
        toast.error('Could not open that detail panel');
        closeDetailStack();
        return;
      }
      setLoaded(result);
    });

    return () => {
      cancelled = true;
    };
  }, [active]);

  if (!active || active.kind === 'receiving') return null;

  if (loading || !loaded) {
    return <DetailStackLoadingShell stackId={`${active.kind}:${active.id}`} onClose={handleClose} />;
  }

  if (loaded.kind === 'order') {
    // Non-desk opens: compact peek only. The full order record stays on the
    // shipping desks (`OrderRecordView` in the outbound ledger; the Shipped desk
    // opens the package record, `ShipmentRecordView`).
    return <CompactOrderPeek order={loaded.order} onClose={handleClose} />;
  }

  if (loaded.kind === 'plan') {
    return (
      <FbaBoardDetailPanel
        item={loaded.item}
        onClose={handleClose}
        onNavigate={() => {}}
        onSaved={handleUpdate}
        disableMoveUp
        disableMoveDown
      />
    );
  }

  if (loaded.kind === 'claim') {
    return (
      <RepairDetailsPanel
        repair={loaded.repair}
        onClose={handleClose}
        onUpdate={handleUpdate}
      />
    );
  }

  return null;
}
