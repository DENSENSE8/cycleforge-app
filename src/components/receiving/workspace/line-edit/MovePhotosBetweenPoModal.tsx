'use client';

/**
 * Bidirectional photo move between POs — opened from More Actions → Photos.
 *
 * Forward: select photos on this carton → pick a target PO → reassign.
 * Back: pick a source PO → select its photos → reassign onto this carton.
 * Reuses the reassign SoT (`reassignPhotoToReceiving` → PATCH /api/photos/:id/reassign).
 *
 * On full success: AnimatedCheck beat inside the overlay, then soft-close.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeftRight, Loader2, Package, Search, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { PaneHeaderTabs } from '@/components/ui/pane-header';
import { AnimatedCheck } from '@/components/ui/AnimatedCheck';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { reassignPhotoToReceiving } from '@/components/shipped/photo-gallery/photo-gallery-api';
import { useClaimPhotos } from '../claim/hooks/useClaimPhotos';
import { ClaimPhotoPicker } from '../claim/components/ClaimPhotoPicker';
import { refreshDomains } from '@/lib/refresh/bus';

interface PoListRow {
  po_id: string;
  po_number: string;
  receiving_id: number | null;
}

type Direction = 'to' | 'from';

interface SuccessBeat {
  direction: Direction;
  moved: number;
  otherLabel: string | null;
}

/** Hold the success frame long enough for AnimatedCheck to finish, then close. */
const SUCCESS_HOLD_MS = 1400;
const SUCCESS_HOLD_REDUCED_MS = 600;

export function MovePhotosBetweenPoModal({
  open,
  receivingId,
  onClose,
  onMoved,
}: {
  open: boolean;
  /** Carton the move is relative to (photos on this carton ↔ another PO). */
  receivingId: number | null;
  onClose: () => void;
  /** Fired after at least one photo moved successfully (parents invalidate caches). */
  onMoved?: () => void;
}) {
  const thisReceivingId = receivingId;
  const reduceMotion = useReducedMotion();
  const [direction, setDirection] = useState<Direction>('to');
  const [search, setSearch] = useState('');
  const [poRows, setPoRows] = useState<PoListRow[]>([]);
  const [poLoading, setPoLoading] = useState(false);
  const [otherReceivingId, setOtherReceivingId] = useState<number | null>(null);
  const [otherLabel, setOtherLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<SuccessBeat | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Source of photos depends on direction.
  const sourceReceivingId =
    direction === 'to' ? thisReceivingId : otherReceivingId;
  const targetReceivingId =
    direction === 'to' ? otherReceivingId : thisReceivingId;

  const photos = useClaimPhotos(open && sourceReceivingId != null && !success, sourceReceivingId);

  const clearCloseTimer = () => {
    if (closeTimer.current != null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  // Reset when closed / direction flips.
  useEffect(() => {
    if (!open) {
      clearCloseTimer();
      setDirection('to');
      setSearch('');
      setPoRows([]);
      setOtherReceivingId(null);
      setOtherLabel(null);
      setBusy(false);
      setSuccess(null);
    }
  }, [open]);

  useEffect(() => () => clearCloseTimer(), []);

  useEffect(() => {
    if (success) return;
    setOtherReceivingId(null);
    setOtherLabel(null);
    setSearch('');
    setPoRows([]);
  }, [direction, success]);

  // PO search — all PO-bearing cartons (not just open), so operators can move
  // photos onto already-unboxed / received POs.
  useEffect(() => {
    if (!open || success) return;
    // When pushing, we need a target PO after photos are selected; when pulling,
    // we need a source PO first. Always allow search.
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPoLoading(true);
      try {
        const params = new URLSearchParams({ limit: '25' });
        const q = search.trim();
        if (q) params.set('search', q);
        const res = await fetch(`/api/receiving/po/list?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { purchase_orders?: PoListRow[] };
        const list = (data.purchase_orders ?? []).filter(
          (r) => r.receiving_id != null && r.receiving_id !== thisReceivingId,
        );
        setPoRows(list);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setPoRows([]);
      } finally {
        setPoLoading(false);
      }
    }, search.trim() ? 280 : 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, search, thisReceivingId, success]);

  const finishAndClose = (beat: SuccessBeat) => {
    setSuccess(beat);
    clearCloseTimer();
    closeTimer.current = setTimeout(
      () => {
        closeTimer.current = null;
        onClose();
      },
      reduceMotion ? SUCCESS_HOLD_REDUCED_MS : SUCCESS_HOLD_MS,
    );
  };

  const move = async () => {
    if (!targetReceivingId || photos.selectedPhotoIds.size === 0 || busy || success) return;
    setBusy(true);
    const ids = [...photos.selectedPhotoIds];
    let moved = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await reassignPhotoToReceiving(id, targetReceivingId);
        moved++;
      } catch {
        failed++;
      }
    }
    setBusy(false);
    if (moved > 0) {
      refreshDomains(['receiving.lines', 'receiving.poLines']);
      onMoved?.();
      if (failed === 0) {
        finishAndClose({
          direction,
          moved,
          otherLabel,
        });
      } else {
        await photos.refetch();
        toast.error(`${failed} photo${failed === 1 ? '' : 's'} failed to move`);
      }
      return;
    }
    if (failed > 0) {
      toast.error(`${failed} photo${failed === 1 ? '' : 's'} failed to move`);
    }
  };

  const canMove =
    thisReceivingId != null &&
    targetReceivingId != null &&
    sourceReceivingId != null &&
    photos.selectedPhotoIds.size > 0 &&
    !busy &&
    !success;

  const successHeadline = success
    ? success.direction === 'to'
      ? `Moved ${success.moved} photo${success.moved === 1 ? '' : 's'}`
      : `Pulled ${success.moved} photo${success.moved === 1 ? '' : 's'}`
    : '';
  const successDetail = success
    ? success.direction === 'to'
      ? `to ${success.otherLabel ?? 'another PO'}`
      : `from ${success.otherLabel ?? 'another PO'} onto this carton`
    : '';

  return (
    <RightPaneOverlay
      open={open}
      onClose={onClose}
      align="center"
      resizable
      storageKey="receiving-move-photos-modal-size"
      minWidth={460}
      minHeight={420}
      className="-mt-8 h-[min(86vh,44rem)] w-[min(94vw,52rem)]"
      aria-label="Move photos"
    >
      <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-semibold text-text-default">Move photos</span>
        </div>
        <IconButton
          onClick={onClose}
          ariaLabel="Close"
          icon={<X className="h-4 w-4" />}
          className="rounded-full p-1.5 text-text-soft hover:bg-surface-hover"
        />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {success ? (
          <motion.div
            key="move-photos-success"
            role="status"
            aria-live="polite"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center"
          >
            <AnimatedCheck size={56} />
            <div className="space-y-1">
              <p className="text-base font-semibold text-text-default">{successHeadline}</p>
              <p className="text-sm text-text-soft">{successDetail}</p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="move-photos-form"
            initial={false}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-role-data">
              <PaneHeaderTabs<Direction>
                tabs={[
                  { value: 'to', label: 'To another PO' },
                  { value: 'from', label: 'From another PO' },
                ]}
                value={direction}
                onChange={setDirection}
                className="rounded-lg border border-border-soft px-1 py-0.5"
              />

              {/* Pull: pick source PO first */}
              {(direction === 'from' || (direction === 'to' && photos.photos.length > 0)) && (
                <div className="space-y-2">
                  <p className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
                    {direction === 'to' ? 'Target purchase order' : 'Source purchase order'}
                    {otherLabel ? ` · ${otherLabel}` : ''}
                  </p>
                  {!otherReceivingId ? (
                    <>
                      <div className="flex items-center gap-2 rounded-lg border border-border-soft bg-surface-card px-3 py-2">
                        <Search className="h-4 w-4 shrink-0 text-text-faint" />
                        <input
                          type="search"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search PO number…"
                          className={cn(
                            'w-full bg-transparent text-sm text-text-default placeholder:text-text-faint',
                            focusRing('field', 'accent'),
                          )}
                          autoFocus
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-border-hairline rounded-lg border border-border-soft">
                        {poLoading ? (
                          <p className="flex items-center justify-center gap-2 py-6 text-xs text-text-soft">
                            <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                          </p>
                        ) : poRows.length === 0 ? (
                          <p className="px-4 py-6 text-center text-xs text-text-soft">
                            No matching POs
                          </p>
                        ) : (
                          poRows.map((r) => (
                            <button
                              // ds-raw-button
                              key={`${r.po_id}-${r.receiving_id}`}
                              type="button"
                              disabled={r.receiving_id == null}
                              onClick={() => {
                                if (r.receiving_id == null) return;
                                setOtherReceivingId(r.receiving_id);
                                setOtherLabel(r.po_number || r.po_id || `Carton #${r.receiving_id}`);
                              }}
                              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-hover"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-text-default">
                                  {r.po_number || r.po_id || `PO #${r.receiving_id}`}
                                </p>
                                <p className="text-xs text-text-soft">Carton #{r.receiving_id}</p>
                              </div>
                              <Package className="h-4 w-4 shrink-0 text-text-faint" />
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setOtherReceivingId(null);
                        setOtherLabel(null);
                      }}
                      className="text-role-eyebrow font-semibold uppercase tracking-widest text-blue-600 hover:underline"
                    >
                      Change PO
                    </button>
                  )}
                </div>
              )}

              {/* Photo picker — needs a source carton */}
              {sourceReceivingId != null ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
                      {direction === 'to' ? 'Photos on this carton' : 'Photos on source PO'}
                    </p>
                    {photos.photos.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => photos.toggleSelectAll()}
                        className="text-role-eyebrow font-semibold uppercase tracking-widest text-blue-600 hover:underline"
                      >
                        {photos.selectedPhotoIds.size === photos.photos.length
                          ? 'Clear'
                          : 'Select all'}
                      </button>
                    ) : null}
                  </div>
                  {photos.photos.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border-soft px-4 py-6 text-center text-xs text-text-soft">
                      No photos on this carton yet.
                    </p>
                  ) : (
                    <ClaimPhotoPicker photos={photos} receivingId={sourceReceivingId} />
                  )}
                </div>
              ) : direction === 'from' ? (
                <p className="rounded-lg border border-dashed border-border-soft px-4 py-6 text-center text-xs text-text-soft">
                  Pick a source PO to see its photos.
                </p>
              ) : null}
            </div>

            <div className="border-t border-border-soft px-4 py-3">
              <Button
                variant="primary"
                size="sm"
                className="w-full justify-center"
                loading={busy}
                disabled={!canMove}
                onClick={() => void move()}
                icon={<ArrowLeftRight className="h-4 w-4" />}
              >
                {direction === 'to'
                  ? `Move ${photos.selectedPhotoIds.size || ''} to PO`.trim()
                  : `Pull ${photos.selectedPhotoIds.size || ''} onto this carton`.trim()}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </RightPaneOverlay>
  );
}
