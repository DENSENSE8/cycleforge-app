'use client';

/**
 * Bulk assign picker for Testing triage multi-select — picks a technician and
 * PATCHes `assigned_tech_id` on each selected receiving line.
 */

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { StaffButtonGrid, type StaffOption } from '@/components/shipping/StaffButtonGrid';
import { getActiveStaff } from '@/lib/staffCache';
import { staffHasRole } from '@/utils/staff';
import { Button } from '@/design-system/primitives';

export function TestingAssignDialog({
  open,
  count,
  onClose,
  onPick,
}: {
  open: boolean;
  count: number;
  onClose: () => void;
  onPick: (techId: number) => void;
}) {
  const [options, setOptions] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    getActiveStaff()
      .then((list) => {
        if (!alive) return;
        setOptions(
          list
            .filter((m) => staffHasRole(m, 'technician'))
            .map((m) => ({ id: m.id, name: m.name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => {
        if (alive) setOptions([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-role-caption font-semibold">
            Assign {count} line{count === 1 ? '' : 's'}
          </DialogTitle>
          <DialogDescription className="text-role-caption text-text-muted">
            Choose a technician. Assigned lines show up under that tech&apos;s Mine scope.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-role-caption text-text-soft">Loading technicians…</p>
        ) : (
          <StaffButtonGrid
            label="Technicians"
            options={options}
            selectedId={null}
            onSelect={(id) => {
              onPick(id);
              onClose();
            }}
            columns={2}
            emptyMessage="No technicians available"
          />
        )}
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
