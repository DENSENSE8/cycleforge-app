'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, MapPin, Trash2 } from '@/components/Icons';
import { fetchWithStepUp } from '@/components/auth/StepUpModal';
import { useStepUp } from '@/components/providers/StepUpProvider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { ArmedDangerButton } from '@/design-system/components/ArmedDangerButton';
import { FILTER_DROPDOWN_SELECT_CLASS } from '@/design-system/components/FilterDropdownSelect';
import { Button } from '@/design-system/primitives';
import { ACTION_DOCK_LIFT, ACTION_DOCK_TOP_GAP, FLOATING_ACTION_DISABLED_FACE } from '@/design-system/tokens/dock-clearance';
import { useBinsOverview } from '@/hooks/useBinsOverview';
import { locationHierarchy } from '@/lib/inventory/location-deletion';
import type { LocationDeleteTarget } from '@/lib/neon/location-queries';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

interface PreviewPayload {
  success?: boolean;
  error?: string;
  targets?: LocationDeleteTarget[];
  counts?: { total: number; deletable: number; blocked: number };
  deactivated?: number;
}

interface LocationDeletionManagerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialIds?: readonly number[];
  variant?: 'dialog' | 'page';
  onDeleteStart?: (ids: readonly number[]) => void;
  onDeleteRollback?: (ids: readonly number[]) => void;
  onDeleted?: (ids: readonly number[]) => void | Promise<void>;
}

function numericOptions(values: Array<number | null>): number[] {
  return Array.from(new Set(values.filter((value): value is number => value != null))).sort((a, b) => a - b);
}

function scopeSummary(input: {
  room: string;
  aisle: string;
  bay: string;
  level: string;
  position: string;
}): string {
  const parts = [input.room];
  if (input.aisle) parts.push(`Aisle ${input.aisle.padStart(2, '0')}`);
  if (input.bay) parts.push(`Bay ${input.bay.padStart(2, '0')}`);
  if (input.level) parts.push(`Level ${input.level}`);
  if (input.position) parts.push(input.position === '0' ? 'Rack level' : `Position ${input.position.padStart(2, '0')}`);
  return parts.filter(Boolean).join(' · ');
}

export function LocationDeletionManager({
  open = true,
  onOpenChange,
  initialIds = [],
  variant = 'dialog',
  onDeleteStart,
  onDeleteRollback,
  onDeleted,
}: LocationDeletionManagerProps) {
  const requestStepUp = useStepUp();
  const { rows, loading: rowsLoading, refetch } = useBinsOverview({ pollMs: 0 });
  const [room, setRoom] = useState('');
  const [aisle, setAisle] = useState('');
  const [bay, setBay] = useState('');
  const [level, setLevel] = useState('');
  const [position, setPosition] = useState('');
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [busy, setBusy] = useState<'preview' | 'delete' | null>(null);
  const [deactivationOpen, setDeactivationOpen] = useState(variant !== 'page' || initialIds.length > 0);

  const normalizedRows = useMemo(() => rows.map((row) => ({ row, hierarchy: locationHierarchy(row) })), [rows]);
  const rooms = useMemo(
    () => Array.from(new Set(rows.map((row) => row.room).filter((value): value is string => Boolean(value)))).sort(),
    [rows],
  );
  const roomRows = useMemo(() => normalizedRows.filter((entry) => entry.row.room === room), [normalizedRows, room]);
  const aisles = useMemo(() => numericOptions(roomRows.map((entry) => entry.hierarchy.aisle)), [roomRows]);
  const aisleRows = useMemo(() => roomRows.filter((entry) => !aisle || entry.hierarchy.aisle === Number(aisle)), [aisle, roomRows]);
  const bays = useMemo(() => numericOptions(aisleRows.map((entry) => entry.hierarchy.bay)), [aisleRows]);
  const bayRows = useMemo(() => aisleRows.filter((entry) => !bay || entry.hierarchy.bay === Number(bay)), [aisleRows, bay]);
  const levels = useMemo(() => numericOptions(bayRows.map((entry) => entry.hierarchy.level)), [bayRows]);
  const levelRows = useMemo(() => bayRows.filter((entry) => !level || entry.hierarchy.level === Number(level)), [bayRows, level]);
  const positions = useMemo(() => numericOptions(levelRows.map((entry) => entry.hierarchy.position)), [levelRows]);
  const explicitIds = useMemo(
    () => Array.from(new Set(initialIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))),
    [initialIds],
  );

  const loadPreview = async (ids: readonly number[] = explicitIds) => {
    const params = new URLSearchParams();
    if (ids.length) params.set('ids', ids.join(','));
    else {
      if (!room) {
        toast.error('Choose a room first');
        return;
      }
      params.set('room', room);
      if (aisle) params.set('aisle', aisle);
      if (bay) params.set('bay', bay);
      if (level) params.set('level', level);
      if (position) params.set('position', position);
    }
    setBusy('preview');
    try {
      const response = await fetch(`/api/locations/bulk-delete?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const body = await response.json().catch(() => null) as PreviewPayload | null;
      if (!response.ok) throw new Error(body?.error || 'Could not preview locations');
      setPreview(body);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not preview locations');
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    if (explicitIds.length) void loadPreview(explicitIds);
    // The explicit ID string is the identity of the requested selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, explicitIds.join(',')]);

  const deleteTargets = async () => {
    const targets = (preview?.targets ?? []).filter((target) => target.deletable);
    if (!preview || targets.length === 0 || busy) return;
    const ids = targets.map((target) => target.id);
    const previousPreview = preview;
    const deletingIds = new Set(ids);
    const remainingTargets = (preview.targets ?? []).filter((target) => !deletingIds.has(target.id));
    setPreview({
      ...preview,
      targets: remainingTargets,
      counts: {
        total: remainingTargets.length,
        deletable: remainingTargets.filter((target) => target.deletable).length,
        blocked: remainingTargets.filter((target) => !target.deletable).length,
      },
    });
    onDeleteStart?.(ids);
    setBusy('delete');
    const toastId = `location-delete-${Date.now()}`;
    toast.loading(
      `Deleting ${targets.length} location${targets.length === 1 ? '' : 's'} — rechecking stock, staged units and active counts…`,
      { id: toastId },
    );
    try {
      const response = await fetchWithStepUp('/api/locations/bulk-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationIds: ids }),
      }, (scope) => requestStepUp(scope, `delete ${targets.length} warehouse location${targets.length === 1 ? '' : 's'}`));
      const body = await response.json().catch(() => null) as PreviewPayload | null;
      if (!response.ok || body?.success === false) {
        const blocked = body?.targets?.find((target) => !target.deletable);
        const exactReason = blocked?.blockedReasons.length
          ? `${blocked.face} — ${blocked.blockedReasons.join(' · ')}`
          : null;
        if (body?.targets) setPreview(body);
        throw new Error([body?.error || 'Could not delete locations', exactReason].filter(Boolean).join(': '));
      }
      toast.success(`Deleted ${body?.deactivated ?? targets.length} location${(body?.deactivated ?? targets.length) === 1 ? '' : 's'}`, { id: toastId });
      setPreview(null);
      await refetch();
      await onDeleted?.(ids);
      if (variant === 'dialog') onOpenChange?.(false);
    } catch (error) {
      setPreview(previousPreview);
      onDeleteRollback?.(ids);
      toast.error(error instanceof Error ? error.message : 'Could not delete locations', { id: toastId });
    } finally {
      setBusy(null);
    }
  };

  if (variant === 'page' && !deactivationOpen) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-mode-panel p-4" data-testid="location-management-home">
        <Button
          variant="ghost"
          size="lg"
          radius="flush"
          icon={<AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />}
          onClick={() => setDeactivationOpen(true)}
          className="h-auto min-h-16 w-full justify-start border-y border-mode-rule px-0 py-3 text-left"
          data-testid="location-open-deactivation"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-mode-ink">Delete unused locations</span>
            <span className="block text-role-caption text-mode-muted">Preview exact empty positions; occupied locations stay active.</span>
          </span>
        </Button>
        <p className="mt-4 text-role-caption text-mode-muted">
          Naming changes belong to the individual scanned location so the operator can verify the physical label first.
        </p>
      </div>
    );
  }

  const content = (
    <div className={cn('flex h-full min-h-0 flex-1 flex-col', variant === 'page' && 'bg-mode-panel')} data-testid="location-deletion-manager">
      {variant === 'page' ? (
        <Button
          variant="ghost"
          size="sm"
          radius="flush"
          onClick={() => { setPreview(null); setDeactivationOpen(false); }}
          className="min-h-11 w-full justify-start border-b border-mode-rule px-4 text-left text-sm font-semibold text-text-accent"
        >
          Back to location tools
        </Button>
      ) : null}
      <div className="grid gap-3 border-b border-border-soft p-4 sm:grid-cols-6">
        <label className="grid gap-1 sm:col-span-2">
          <span className="text-role-caption font-semibold text-text-muted">Room</span>
          <select
            value={room}
            disabled={explicitIds.length > 0 || rowsLoading}
            onChange={(event) => {
              setRoom(event.target.value);
              setAisle(''); setBay(''); setLevel(''); setPosition(''); setPreview(null);
            }}
            className={FILTER_DROPDOWN_SELECT_CLASS}
            data-testid="location-delete-room"
          >
            <option value="">Choose room</option>
            {rooms.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        {([
          ['Aisle', aisle, aisles],
          ['Bay', bay, bays],
          ['Level', level, levels],
          ['Position', position, positions],
        ] as const).map(([label, value, options]) => (
          <label key={label} className="grid gap-1">
            <span className="text-role-caption font-semibold text-text-muted">{label}</span>
            <select
              value={value}
              disabled={explicitIds.length > 0 || !room}
              onChange={(event) => {
                const next = event.target.value;
                if (label === 'Aisle') { setAisle(next); setBay(''); setLevel(''); setPosition(''); }
                if (label === 'Bay') { setBay(next); setLevel(''); setPosition(''); }
                if (label === 'Level') { setLevel(next); setPosition(''); }
                if (label === 'Position') setPosition(next);
                setPreview(null);
              }}
              className={FILTER_DROPDOWN_SELECT_CLASS}
              data-testid={`location-delete-${label.toLowerCase()}`}
            >
              <option value="">All</option>
              {options.map((option) => <option key={option} value={option}>{option === 0 ? '00 · rack' : String(option).padStart(2, '0')}</option>)}
            </select>
          </label>
        ))}
        <div className="flex items-end sm:col-span-6">
          <Button
            variant="secondary"
            size="lg"
            icon={<MapPin />}
            className="w-full sm:w-auto"
            loading={busy === 'preview'}
            disabled={!explicitIds.length && !room}
            onClick={() => void loadPreview()}
            data-testid="location-delete-preview"
          >
            Identify exact locations
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {preview ? (
          <>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-soft bg-surface-card/95 px-4 py-3 backdrop-blur">
              <div>
                <p className="text-sm font-semibold text-text-default">
                  {preview.counts?.total ?? 0} exact location{preview.counts?.total === 1 ? '' : 's'}
                </p>
                <p className="text-role-caption text-text-muted">
                  {explicitIds.length ? 'Selected table rows' : scopeSummary({ room, aisle, bay, level, position })}
                </p>
              </div>
              <div className="text-right text-role-caption">
                <p className="font-semibold text-emerald-700">{preview.counts?.deletable ?? 0} empty</p>
                <p className="font-semibold text-amber-700">{preview.counts?.blocked ?? 0} blocked</p>
              </div>
            </div>
            {(preview.targets ?? []).length ? (preview.targets ?? []).map((target) => (
              <div key={target.id} className="grid min-h-14 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border-soft px-4 py-2" data-testid="location-delete-target">
                <span className={cn('h-2.5 w-2.5 rounded-full', target.deletable ? 'bg-emerald-500' : 'bg-amber-500')} aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-sm font-semibold text-text-default">{target.face}</span>
                  <span className="block truncate text-role-caption text-text-muted">{target.name} · {target.room ?? 'No room'}</span>
                </span>
                <span className={cn('max-w-52 text-right text-role-caption font-semibold', target.deletable ? 'text-emerald-700' : 'text-amber-700')}>
                  {target.deletable ? 'Empty · can delete' : target.blockedReasons.join(' · ')}
                </span>
              </div>
            )) : (
              <div className="px-6 py-12 text-center">
                <MapPin className="mx-auto h-6 w-6 text-text-faint" />
                <p className="mt-2 text-sm font-semibold text-text-default">No active locations in this scope</p>
                <p className="mt-1 text-role-caption text-text-muted">Nothing will be deactivated.</p>
              </div>
            )}
          </>
        ) : (
          <div className="px-6 py-12 text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />
            <p className="mt-2 text-sm font-semibold text-text-default">Preview before deleting</p>
            <p className="mx-auto mt-1 max-w-md text-role-caption text-text-muted">Choose a hierarchy scope. Every exact rack-level and numbered position will be listed, with occupied locations blocked.</p>
          </div>
        )}
      </div>

      {/* The one verb floats on the floor — no bar or rule behind it (owner 2026-10-03). */}
      <div className={cn('flex shrink-0 justify-end px-4', ACTION_DOCK_TOP_GAP, ACTION_DOCK_LIFT)}>
        <ArmedDangerButton
          size="lg"
          icon={<Trash2 />}
          className={cn('w-full sm:w-auto sm:min-w-64', FLOATING_ACTION_DISABLED_FACE)}
          loading={busy === 'delete'}
          disabled={(preview?.counts?.deletable ?? 0) === 0}
          onConfirm={deleteTargets}
          label={`Delete ${preview?.counts?.deletable ?? 0} empty location${preview?.counts?.deletable === 1 ? '' : 's'}`}
          confirmLabel={`Click again to delete ${preview?.counts?.deletable ?? 0}`}
          data-testid="location-delete-submit"
        />
      </div>
    </div>
  );

  if (variant === 'page') return content;
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange?.(next); }}>
      <DialogContent hideClose className="flex h-[min(88dvh,760px)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border-soft px-4 py-3 pr-12 text-left">
          <DialogTitle>Delete warehouse locations</DialogTitle>
          <DialogDescription>Preview an aisle, bay, level, position, or selected table rows. Occupied locations remain active.</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
