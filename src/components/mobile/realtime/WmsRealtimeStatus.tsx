'use client';

import { useWmsRealtime } from './WmsRealtimeProvider';

export function WmsRealtimeStatus() {
  const { status, latest, message } = useWmsRealtime();
  if (status === 'connecting' || status === 'connected') return null;

  const committed = status === 'committed' && latest?.result.commit;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="wms-task-state"
      data-state={status}
      className={committed
        ? 'border-b border-border-success bg-surface-success px-4 py-2 text-text-success'
        : status === 'accepted'
          ? 'border-b border-border-accent bg-surface-accent px-4 py-2 text-text-accent'
          : 'border-b border-border-danger bg-surface-danger px-4 py-2 text-text-danger'}
    >
      <p className="text-role-caption font-bold">
        {committed
          ? `Slotted · ${latest?.result.selectedSlotId ?? committed.toSlot}`
          : status === 'accepted'
            ? 'Working · checking capacity'
            : message || 'Reroute needs review'}
      </p>
    </div>
  );
}
