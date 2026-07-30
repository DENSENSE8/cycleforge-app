'use client';

/**
 * GlobalDetailStackHost — opens detail slide-overs from anywhere (assistant
 * recents, future global search actions) without navigating away from the
 * operator's current page or mode. Renders into the shared RightRailHost slot
 * via each panel's DetailStackRailRegistrar.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from '@/components/Icons';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { loadDetailStack, type LoadedDetailStack } from '@/lib/detail-stacks/load-detail-stack';
import {
  closeDetailStack,
  getActiveDetailStack,
  subscribeActiveDetailStack,
} from '@/lib/detail-stacks/open-store';
import { cartonReadHref } from '@/lib/receiving/surface-path';
import { dispatchDashboardAndStationRefresh } from '@/utils/events';
import { toast } from '@/lib/toast';

const ShippedDetailsPanel = dynamic(
  () => import('@/components/shipped').then((m) => m.ShippedDetailsPanel),
  { ssr: false },
);
const UnshippedDetailsPanel = dynamic(
  () => import('@/components/unshipped/UnshippedDetailsPanel').then((m) => m.UnshippedDetailsPanel),
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

function DetailStackLoadingShell({ stackId, onClose }: { stackId: string; onClose: () => void }) {
  return (
    <DetailStackRailRegistrar id={`detail:global:${stackId}`} onClose={onClose}>
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 bg-surface-card">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <p className="text-role-caption font-semibold text-text-soft">Loading…</p>
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
    if (loaded.context === 'queue') {
      return (
        <UnshippedDetailsPanel shipped={loaded.order} onClose={handleClose} onUpdate={handleUpdate} />
      );
    }
    return (
      <ShippedDetailsPanel
        shipped={loaded.order}
        context="dashboard"
        onClose={handleClose}
        onUpdate={handleUpdate}
      />
    );
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
        disableMoveUp
        disableMoveDown
      />
    );
  }

  return null;
}
