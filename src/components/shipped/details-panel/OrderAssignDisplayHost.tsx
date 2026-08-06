'use client';

/**
 * Order inspector Assign editor — inline technician / packer picker.
 *
 * Mounts above the Order-tab bottom update bar (`OrderUpdateDock`). Never a
 * popover, topic cell, or {@link WorkOrderAssignmentCard} overlay takeover.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { StaffButtonGrid } from '@/components/shipping/StaffButtonGrid';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack/layout';
import { buildAssignmentRow } from '@/components/shipped/details-panel/shipped-details-logic';
import { useWorkOrderAssignment } from '@/hooks/useWorkOrderAssignment';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { cn } from '@/utils/_cn';
import { toast } from '@/lib/toast';

export function OrderAssignDisplayHost({
  shipped,
  onAssigned,
}: {
  shipped: ShippedOrder;
  onAssigned: () => void;
}) {
  const [techId, setTechId] = useState<number | null>(shipped.tester_id ?? null);
  const [packerId, setPackerId] = useState<number | null>(shipped.packer_id ?? null);
  const [deadline, setDeadline] = useState(
    String(shipped.ship_by_date || shipped.deadline_at || '').slice(0, 10),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { technicianOptions, packerOptions, loadStaff, confirmAssignment } =
    useWorkOrderAssignment({
      onAssigned: () => {
        onAssigned();
        toast.success('Assignment saved');
      },
    });

  useEffect(() => {
    setTechId(shipped.tester_id ?? null);
    setPackerId(shipped.packer_id ?? null);
    setDeadline(String(shipped.ship_by_date || shipped.deadline_at || '').slice(0, 10));
  }, [shipped.id, shipped.tester_id, shipped.packer_id, shipped.ship_by_date, shipped.deadline_at]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await loadStaff();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadStaff, shipped.id]);

  const persist = useCallback(
    async (nextTech: number | null, nextPacker: number | null, nextDeadline: string) => {
      setSaving(true);
      try {
        await confirmAssignment(buildAssignmentRow(shipped), {
          techId: nextTech,
          packerId: nextPacker,
          deadline: nextDeadline || null,
          status: nextTech && nextPacker ? 'ASSIGNED' : 'OPEN',
        });
      } finally {
        setSaving(false);
      }
    },
    [confirmAssignment, shipped],
  );

  if (loading) {
    return (
      <div
        className={cn(DISPLAYS_BODY_INSET, 'flex items-center gap-2 py-6 text-role-caption text-text-muted')}
        data-testid="order-assign-display-loading"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading staff…
      </div>
    );
  }

  return (
    <div
      className={cn(DISPLAYS_BODY_INSET, 'flex flex-col gap-4 py-3')}
      data-testid="order-assign-display"
    >
      <StaffButtonGrid
        label="Technician"
        options={technicianOptions}
        selectedId={techId}
        onSelect={(id) => {
          setTechId(id);
          void persist(id, packerId, deadline);
        }}
        emptyMessage="No technicians"
      />
      <StaffButtonGrid
        label="Packer"
        options={packerOptions}
        selectedId={packerId}
        onSelect={(id) => {
          setPackerId(id);
          void persist(techId, id, deadline);
        }}
        columns={2}
        emptyMessage="No packers"
      />
      <div className="flex items-center justify-between gap-3 border-t border-border-hairline pt-3">
        <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">Deadline</span>
        <input
          type="date"
          value={deadline}
          disabled={saving}
          onChange={(e) => {
            const next = e.target.value;
            setDeadline(next);
            void persist(techId, packerId, next);
          }}
          className="rounded-none border border-border-soft bg-surface-card px-2 py-1 text-role-micro text-text-default outline-none focus:border-border-emphasis tabular-nums"
        />
      </div>
      {(techId || packerId) && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={() => {
            setTechId(null);
            setPackerId(null);
            void persist(null, null, deadline);
          }}
        >
          Clear assignment
        </Button>
      )}
    </div>
  );
}
