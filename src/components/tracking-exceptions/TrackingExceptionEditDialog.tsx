'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import type { TrackingExceptionRow } from './types';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

interface EditDialogProps {
  row: TrackingExceptionRow;
  onClose: () => void;
  onSave: (row: TrackingExceptionRow, patch: Partial<TrackingExceptionRow>) => Promise<void>;
  onDelete: (row: TrackingExceptionRow) => Promise<void>;
}

/**
 * Record-plane editor for one tracking exception — opened from the grid row /
 * action cell, never as in-cell edit.
 */
export function TrackingExceptionEditDialog({ row, onClose, onSave, onDelete }: EditDialogProps) {
  const [trackingNumber, setTrackingNumber] = useState(row.tracking_number);
  const [notes, setNotes] = useState(row.notes ?? '');
  const [reason, setReason] = useState(row.exception_reason);
  const [status, setStatus] = useState<TrackingExceptionRow['status']>(row.status);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty = useMemo(
    () =>
      trackingNumber !== row.tracking_number ||
      (notes || '') !== (row.notes || '') ||
      reason !== row.exception_reason ||
      status !== row.status,
    [trackingNumber, notes, reason, status, row],
  );

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      await onSave(row, {
        tracking_number: trackingNumber.trim(),
        notes: notes.trim() || null,
        exception_reason: reason.trim() || 'not_found',
        status,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setErr(null);
    try {
      await onDelete(row);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
    >
      <DialogContent hideClose className="max-w-lg gap-0 overflow-hidden p-0 sm:rounded-xl">
        <DialogHeader className="space-y-0 border-b border-border-soft px-5 py-3">
          <DialogTitle className="text-role-caption font-semibold uppercase tracking-widest text-text-default">
            Edit exception #{row.id}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
              Tracking number
            </span>
            <input
              type="text"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              className={cn("mt-1 w-full rounded-md border border-border-soft px-2 py-1.5 text-role-caption font-mono text-text-default", focusRing("field", "accent"))}
            />
          </label>
          <label className="block">
            <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
              Reason
            </span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={cn("mt-1 w-full rounded-md border border-border-soft px-2 py-1.5 text-role-caption font-semibold text-text-default", focusRing("field", "accent"))}
            />
          </label>
          <label className="block">
            <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
              Status
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TrackingExceptionRow['status'])}
              className={cn("mt-1 w-full rounded-md border border-border-soft bg-surface-card px-2 py-1.5 text-role-caption font-semibold text-text-default", focusRing("field", "accent"))}
            >
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="discarded">Discarded</option>
            </select>
          </label>
          <label className="block">
            <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
              Notes
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={cn("mt-1 w-full rounded-md border border-border-soft px-2 py-1.5 text-role-caption font-semibold text-text-default", focusRing("field", "accent"))}
            />
          </label>

          {err && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-role-caption font-semibold text-red-700">{err}</p>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-border-soft px-5 py-3 sm:justify-between">
          {!confirmingDelete ? (
            // ds-raw-button: low-emphasis destructive action — transparent bg with red text. No variant fits: `danger` is solid red-fill, `ghost` would drop the red affordance.
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={saving}
              className="rounded-md px-2.5 py-1.5 text-role-micro uppercase tracking-widest text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-role-micro uppercase tracking-widest text-red-700">
                Confirm delete?
              </span>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => void handleDelete()}
                disabled={saving}
              >
                Yes, delete
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirmingDelete(false)}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="brand"
              onClick={() => void handleSave()}
              disabled={saving || !dirty}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
