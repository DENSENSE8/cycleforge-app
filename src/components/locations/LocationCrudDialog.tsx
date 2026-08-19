'use client';

/**
 * @domain-job Portable location CRUD — browse / edit / delete / print a bin, and
 *   mint a new one, from ANY page.
 * @hardware-target Station
 * @density ops
 * @justification Cannot reuse `ArrivalLocationsDisplay`: that leaf is a Displays
 *   right-edge occupant bound to `TriageStagingController` (its rows COMMIT an
 *   arrival placement), it has no edit or delete verb, and it cannot mount off
 *   the triage station. This is the same job's page-agnostic dialog form. It
 *   forks NO waist: the catalog and its writes come from {@link useLocations},
 *   minting goes through `registerLocations` (the bin-label-printer door), and
 *   the sticker is the same {@link PrintLabel} card on the same 3in × 2in
 *   `@page` — so a printed address stays the one flat format
 *   `extractArrivalLocationBarcode` can decode.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MapPin, Pencil, Plus, Printer, Search, Trash2 } from '@/components/Icons';
import { PrintLabel } from '@/components/barcode/bin-label-printer';
import { registerLocations } from '@/components/barcode/bin-label-printer/bin-printer-api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { Button, IconButton } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useLocations } from '@/hooks/useLocations';
import { useOrgGs1 } from '@/hooks/useOrgGs1';
import { locationCode, type LocationSegments } from '@/lib/barcode-routing';
import {
  buildUpdateLocationBody,
  filterLocations,
  locationPrintSegments,
  locationRowFace,
  locationRowSubtitle,
  locationRowToForm,
  validateLocationForm,
  type LocationFormValues,
  type LocationRow,
} from '@/lib/locations/location-crud';
import {
  printableRoomNames,
  suggestNextPosition,
  zoneLetterForRoom,
} from '@/lib/receiving/arrival-new-location';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

type Mode = 'browse' | 'edit' | 'new';

const FIELD_CLASS = cn(
  'h-8 w-full min-w-0 rounded-none border border-border-soft bg-surface-card px-2',
  'text-role-caption tabular-nums text-text-default',
  focusRing('field', 'accent'),
);

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  inputMode?: 'numeric';
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-role-micro font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <input
        type="text"
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={FIELD_CLASS}
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  );
}

export function LocationCrudDialog({
  open,
  onOpenChange,
  /** Bin code to select on open — the line's current putaway, when it has one. */
  initialBarcode,
  /** Fired after a successful create so the host can stage onto the new bin. */
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialBarcode?: string | null;
  onCreated?: (row: { id: number; barcode: string | null; name: string | null }) => void;
}) {
  const {
    locations,
    rooms,
    loading,
    updateBin,
    removeBin,
    binMutating,
    binMutationError,
    refetch,
  } = useLocations();
  const { identity: orgGs1 } = useOrgGs1();

  const [mode, setMode] = useState<Mode>('browse');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<LocationFormValues | null>(null);
  const [original, setOriginal] = useState<LocationFormValues | null>(null);
  const [printSegments, setPrintSegments] = useState<LocationSegments | null>(null);
  const [printRoom, setPrintRoom] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // New-bin address state.
  const [newRoom, setNewRoom] = useState('');
  const [aisle, setAisle] = useState('1');
  const [bay, setBay] = useState('1');
  const [level, setLevel] = useState('1');
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => locations as unknown as LocationRow[], [locations]);
  const visible = useMemo(() => filterLocations(rows, query), [rows, query]);
  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const roomNames = useMemo(
    () => printableRoomNames(rooms as never),
    [rooms],
  );

  // Reset to a clean browse state on every open; preselect the caller's bin.
  useEffect(() => {
    if (!open) return;
    setMode('browse');
    setQuery('');
    setConfirmDelete(false);
    setPrintSegments(null);
    const code = (initialBarcode || '').trim();
    const match = code ? rows.find((r) => (r.barcode || '').trim() === code) : null;
    setSelectedId(match?.id ?? null);
    setNewRoom((prev) => prev || roomNames[0] || '');
    // `rows`/`roomNames` are intentionally excluded: reopening should not
    // clobber the operator's selection every time the catalog refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialBarcode]);

  const beginEdit = useCallback((row: LocationRow) => {
    const values = locationRowToForm(row);
    setSelectedId(row.id);
    setForm(values);
    setOriginal(values);
    setConfirmDelete(false);
    setMode('edit');
  }, []);

  /** Reprint an existing bin's sticker — same card, same page as the printer. */
  const printExisting = useCallback((row: LocationRow) => {
    const segments = locationPrintSegments(row);
    if (!segments) {
      toast.error(
        'This bin has no printable rack address — only scannable codes can be printed.',
      );
      return;
    }
    setPrintSegments(segments);
    setPrintRoom((row.room || '').trim());
    // Let the print zone paint before the browser snapshots the page.
    requestAnimationFrame(() => window.print());
  }, []);

  const saveEdit = useCallback(async () => {
    if (!selected || !form || !original) return;
    const invalid = validateLocationForm(form);
    if (invalid) {
      toast.error(invalid.message);
      return;
    }
    const body = buildUpdateLocationBody(original, form);
    if (!body) {
      setMode('browse');
      return;
    }
    const code = (selected.barcode || '').trim();
    if (!code) {
      toast.error('This bin has no barcode, so it cannot be edited by code.');
      return;
    }
    const updated = await updateBin(code, body);
    if (!updated) {
      toast.error(binMutationError?.message || 'Could not update location');
      return;
    }
    toast.success(`Updated ${locationRowFace(selected)}`);
    setMode('browse');
  }, [selected, form, original, updateBin, binMutationError]);

  const doDelete = useCallback(async () => {
    if (!selected) return;
    const code = (selected.barcode || '').trim();
    if (!code) {
      toast.error('This bin has no barcode, so it cannot be deleted by code.');
      return;
    }
    const face = locationRowFace(selected);
    const ok = await removeBin(code);
    if (!ok) {
      // The route returns 409 with the blocking SKUs when the bin holds stock.
      toast.error(binMutationError?.message || 'Could not delete location');
      return;
    }
    toast.success(`Deleted ${face}`);
    setSelectedId(null);
    setConfirmDelete(false);
    setMode('browse');
  }, [selected, removeBin, binMutationError]);

  /**
   * Mint a bin at the next free position on the chosen room/aisle/bay/level,
   * then print it. Address math is `suggestNextPosition` — the same helper the
   * Arrival leaf uses, so both doors fill retired slots before appending.
   */
  const createAndPrint = useCallback(async () => {
    const room = newRoom.trim();
    if (!room) {
      toast.error('Pick a room first');
      return;
    }
    const zone = zoneLetterForRoom(rooms as never, room);
    if (!zone) {
      toast.error(
        `${room} has never been printed, so it has no zone letter yet — mint the first label from Arrival → Locations → New.`,
      );
      return;
    }
    const at = {
      zone,
      aisle: Number(aisle) || 1,
      bay: Number(bay) || 1,
      level: Number(level) || 1,
    };
    const position = suggestNextPosition(locations as never, at);
    if (position == null) {
      toast.error('That level is full — pick another bay or level.');
      return;
    }
    const segments: LocationSegments = { ...at, position };
    setBusy(true);
    try {
      const bins = await registerLocations(room, [segments]);
      const minted = bins[0];
      toast.success(`Created ${locationCode(segments)}`);
      onCreated?.({
        id: (minted as { id: number } | undefined)?.id ?? 0,
        barcode: (minted as { barcode?: string | null } | undefined)?.barcode ?? null,
        name: (minted as { name?: string | null } | undefined)?.name ?? null,
      });
      refetch();
      setPrintSegments(segments);
      setPrintRoom(room);
      requestAnimationFrame(() => window.print());
      setMode('browse');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create location');
    } finally {
      setBusy(false);
    }
  }, [newRoom, rooms, aisle, bay, level, locations, onCreated, refetch]);

  const working = busy || binMutating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'new'
              ? 'New location'
              : mode === 'edit'
                ? `Edit ${selected ? locationRowFace(selected) : 'location'}`
                : 'Locations'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'new'
              ? 'Mint the next free slot on a shelf and print its sticker.'
              : mode === 'edit'
                ? 'Rename a bin, give it an operator nickname, or retire it.'
                : 'Browse, edit, reprint, or retire a bin.'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'browse' ? (
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search bins, rooms, codes…"
                  aria-label="Search locations"
                  className={cn(FIELD_CLASS, 'pl-7')}
                  autoComplete="off"
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setMode('new')}
              >
                New
              </Button>
            </div>

            <ul className="max-h-80 min-h-0 divide-y divide-border-hairline overflow-y-auto">
              {loading ? (
                <li className="flex items-center gap-2 py-6 text-role-caption text-text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading locations…
                </li>
              ) : visible.length === 0 ? (
                <li className="py-6 text-role-caption text-text-soft">
                  No locations match “{query}”.
                </li>
              ) : (
                visible.map((row) => (
                  <li
                    key={row.id}
                    className={cn(
                      'flex items-center gap-2 py-2',
                      row.id === selectedId && 'bg-surface-hover',
                    )}
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-role-caption font-semibold text-text-default">
                        {locationRowFace(row)}
                      </div>
                      <div className="truncate text-role-micro text-text-soft">
                        {locationRowSubtitle(row)}
                      </div>
                    </div>
                    <IconButton
                      size="sm"
                      tone="neutral"
                      ariaLabel={`Print label for ${locationRowFace(row)}`}
                      icon={<Printer className="h-3.5 w-3.5" />}
                      onClick={() => printExisting(row)}
                    />
                    <IconButton
                      size="sm"
                      tone="neutral"
                      ariaLabel={`Edit ${locationRowFace(row)}`}
                      icon={<Pencil className="h-3.5 w-3.5" />}
                      onClick={() => beginEdit(row)}
                    />
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : mode === 'edit' && form ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Name"
                value={form.name}
                onChange={(name) => setForm({ ...form, name })}
              />
              <Field
                label="Nickname"
                value={form.displayName}
                placeholder="Operator face"
                onChange={(displayName) => setForm({ ...form, displayName })}
              />
              <Field
                label="Bin code"
                value={form.barcode}
                onChange={(barcode) => setForm({ ...form, barcode })}
              />
              <Field
                label="Bin type"
                value={form.binType}
                onChange={(binType) => setForm({ ...form, binType })}
              />
              <Field
                label="Capacity"
                value={form.capacity}
                inputMode="numeric"
                onChange={(capacity) => setForm({ ...form, capacity })}
              />
            </div>
            <p className="text-role-micro text-text-soft">
              Changing the bin code re-keys what a scan resolves to. Room moves
              live in Settings → Locations, which re-keys every bin in the room.
            </p>

            {confirmDelete ? (
              <div className="flex items-center justify-between gap-2 border border-red-300 bg-red-50/60 px-3 py-2">
                <span className="text-role-caption text-red-700">
                  Retire this bin? It must be empty first.
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={working}
                    onClick={() => void doDelete()}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                disabled={working}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Printer className="h-3.5 w-3.5" />}
                  disabled={!selected}
                  onClick={() => selected && printExisting(selected)}
                >
                  Print label
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setMode('browse')}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={working}
                  onClick={() => void saveEdit()}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-role-micro font-semibold uppercase tracking-wider text-text-muted">
                Room
              </span>
              <select
                value={newRoom}
                onChange={(e) => setNewRoom(e.target.value)}
                className={FIELD_CLASS}
              >
                {roomNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Aisle" value={aisle} inputMode="numeric" onChange={setAisle} />
              <Field label="Bay" value={bay} inputMode="numeric" onChange={setBay} />
              <Field label="Level" value={level} inputMode="numeric" onChange={setLevel} />
            </div>
            <p className="text-role-micro text-text-soft">
              The next free position on that level is chosen automatically, so
              the printed code stays the one scannable format.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setMode('browse')}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={working}
                icon={<Printer className="h-3.5 w-3.5" />}
                onClick={() => void createAndPrint()}
              >
                Create &amp; print
              </Button>
            </div>
          </div>
        )}

        {/* Print zone — hidden on screen, fills the 3in × 2in page on print. */}
        <div className="label-print-zone">
          {printSegments ? (
            <PrintLabel
              segments={printSegments}
              roomName={printRoom}
              gln={orgGs1?.gln ?? ''}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
