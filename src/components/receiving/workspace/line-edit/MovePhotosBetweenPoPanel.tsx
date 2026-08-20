'use client';

/**
 * Bidirectional photo move between cartons / POs — chrome-free panel body.
 *
 * Forward: select photos on this carton → pick a target carton → reassign.
 * Back: pick a source carton → select its photos → reassign onto this carton.
 * Reuses the reassign SoT (`reassignPhotoToReceiving` → PATCH /api/photos/:id/reassign).
 *
 * Target search is GET /api/receiving/photo-move-targets (any receiving carton,
 * including unmatched / ticket-anchored) — not the Zoho-PO-only po/list feed.
 *
 * Hosted by Unbox Displays Photos→Move or the thin
 * {@link MovePhotosBetweenPoRail} overlay for non-Unbox hosts.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { ArrowLeftRight, Loader2, Package, X } from '@/components/Icons';
import { Button, FlushTerminalFooter, IconButton } from '@/design-system/primitives';
import { SearchableSelectField } from '@/design-system/components';
import {
  DenseComposeLabel,
  DenseComposeSearchInput,
} from '@/design-system/components/DenseComposeFields';
import { AnimatedCheck } from '@/components/ui/AnimatedCheck';
import {
  OrderIdChip,
  PoChip,
  TicketChip,
  TrackingChip,
  getLast8,
} from '@/components/ui/CopyChip';
import { StackedRowIdentity } from '@/components/ui/StackedRowIdentity';
import { toast } from '@/lib/toast';
import { reassignPhotoToReceiving } from '@/components/shipped/photo-gallery/photo-gallery-api';
import { notifyReceivingPhotoChanged } from '@/lib/queries/receiving-queries';
import { useClaimPhotos } from '../claim/hooks/useClaimPhotos';
import { ClaimPhotoPicker } from '../claim/components/ClaimPhotoPicker';
import { parsePoListSearch } from '@/lib/receiving/po-list-search';
import { photoMoveTargetLabel } from '@/lib/receiving/photo-move-targets-shared';
import {
  UNFOUND_PO_DISPLAY,
  UNFOUND_PO_SENTINEL,
} from '@/lib/receiving/po-group-title';
import { receivingHandle, scannedReceivingId } from '@/lib/barcode-routing';

/**
 * What the operator put in the box, in the ONE vocabulary the API understands.
 *
 * The box says "type or scan", so a scan is decoded FIRST — through `routeScan`
 * (via {@link scannedReceivingId}), the only thing allowed to interpret a scan.
 * A printed carton sticker carries an absolute Digital Link, not `R-1234`, so
 * before this the scanned URL went to the API as a text needle, matched nothing,
 * and the operator got an empty list with no explanation.
 *
 * A decoded scan is sent as the canonical `R-{id}` handle because
 * `/api/receiving/photo-move-targets` resolves that to an exact `receiving_id`;
 * `parsePoListSearch` stays the *human-text* helper it was, never a second
 * decoder.
 */
function poSearchNeedle(raw: string): string {
  const scanned = scannedReceivingId(raw);
  if (scanned != null) return receivingHandle(scanned);
  return parsePoListSearch(raw).needle;
}

interface PhotoMoveTargetRow {
  receiving_id: number;
  po_id: string;
  po_number: string;
  title?: string | null;
  tracking_number?: string | null;
  ticket_id?: number | null;
  ticket_external_id?: string | null;
  source?: string | null;
}

type Direction = 'to' | 'from';

const MOVE_DIRECTION_OPTIONS = [
  { value: 'to', label: 'To another carton' },
  { value: 'from', label: 'From another carton' },
];

interface SuccessBeat {
  direction: Direction;
  moved: number;
  otherLabel: string | null;
}

/** Shared carton face for list hits and the selected (blue) row. */
function PhotoMoveTargetFace({ row }: { row: PhotoMoveTargetRow }) {
  const label = photoMoveTargetLabel(row);
  const poValue = String(row.po_number || row.po_id || '').trim();
  const tracking = (row.tracking_number || '').trim();
  const ticketDigits =
    row.ticket_id != null && row.ticket_id > 0 ? String(row.ticket_id) : '';
  const ticketFace = (row.ticket_external_id || ticketDigits).trim();
  const title = String(row.title || '').trim() || label;
  const isUnfoundPo =
    title === UNFOUND_PO_SENTINEL ||
    title === UNFOUND_PO_DISPLAY ||
    row.source === 'unmatched';
  // Carton handle when there's no PO, or always for Unfound stubs
  // (ticket alone must not hide R-{id}).
  const showCartonHandle = !poValue || isUnfoundPo;
  return (
    <StackedRowIdentity
      title={
        <span className="line-clamp-2 break-words text-role-body font-medium text-text-primary">
          {title}
        </span>
      }
      keys={
        <>
          {poValue ? <PoChip value={poValue} dense /> : null}
          {showCartonHandle ? (
            <OrderIdChip
              value={`R-${row.receiving_id}`}
              display={getLast8(`R-${row.receiving_id}`)}
              dense
            />
          ) : null}
          {tracking ? <TrackingChip value={tracking} dense /> : null}
          {ticketDigits ? (
            <TicketChip value={ticketDigits} display={ticketFace} dense />
          ) : null}
        </>
      }
      trailing={<Package className="h-4 w-4 text-text-faint" />}
    />
  );
}

/** Hold the success frame long enough for AnimatedCheck to finish, then close. */
const SUCCESS_HOLD_MS = 1400;
const SUCCESS_HOLD_REDUCED_MS = 600;

export function MovePhotosBetweenPoPanel({
  open,
  receivingId,
  onClose,
  onMoved,
  /**
   * `display` — Unbox Displays Photos→Move: strip + Move·Send tabs already
   * name the verb; omit icon+title band and X (column `→|` owns dismiss).
   * Success stays on Move and resets the form (does not call `onClose`).
   * `modal` — right-rail / overlay hosts keep the title + close; success dismisses.
   */
  chrome = 'modal',
}: {
  open: boolean;
  /** Carton the move is relative to (photos on this carton ↔ another carton). */
  receivingId: number | null;
  onClose: () => void;
  /** Fired after at least one photo moved successfully (parents invalidate caches). */
  onMoved?: () => void;
  chrome?: 'modal' | 'display';
}) {
  const thisReceivingId = receivingId;
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const [direction, setDirection] = useState<Direction>('to');
  const [search, setSearch] = useState('');
  const [targetRows, setTargetRows] = useState<PhotoMoveTargetRow[]>([]);
  const [poLoading, setPoLoading] = useState(false);
  /**
   * True when the needle matched only this carton — server returned recent
   * browse instead of an empty list (`matchedExcludedSelf` on the API).
   */
  const [matchedExcludedSelf, setMatchedExcludedSelf] = useState(false);
  /** Selected other carton — full row so the selected face matches the list. */
  const [otherRow, setOtherRow] = useState<PhotoMoveTargetRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<SuccessBeat | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Needle the operator cleared by deselecting the blue row — suppress
   * re-auto-pick for that same needle until they edit the search.
   */
  const dismissedNeedleRef = useRef<string | null>(null);
  /** After a sole-match auto-pick, select every photo once they load. */
  const pendingSelectAllPhotosRef = useRef(false);

  // Source of photos depends on direction.
  const otherReceivingId = otherRow?.receiving_id ?? null;
  const otherLabel = otherRow ? photoMoveTargetLabel(otherRow) : null;
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

  /** X / deselect — clear search + pick; suppress re-autopick for this needle. */
  const clearPicker = () => {
    dismissedNeedleRef.current = poSearchNeedle(search) || null;
    pendingSelectAllPhotosRef.current = false;
    setOtherRow(null);
    setSearch('');
  };

  // Reset when closed / direction flips.
  useEffect(() => {
    if (!open) {
      clearCloseTimer();
      setDirection('to');
      setSearch('');
      setTargetRows([]);
      setMatchedExcludedSelf(false);
      setOtherRow(null);
      setBusy(false);
      setSuccess(null);
      dismissedNeedleRef.current = null;
      pendingSelectAllPhotosRef.current = false;
    }
  }, [open]);

  useEffect(() => () => clearCloseTimer(), []);

  useEffect(() => {
    if (success) return;
    setOtherRow(null);
    setSearch('');
    setTargetRows([]);
    setMatchedExcludedSelf(false);
    dismissedNeedleRef.current = null;
    pendingSelectAllPhotosRef.current = false;
  }, [direction, success]);

  // Carton search — any receiving carton (PO-bearing, unmatched, ticket-linked).
  // Accepts PO #, tracking #, ticket #, and carton QR handles (`R-<id>` / `#R-<id>`).
  // Self-match (needle is this carton) → server returns recent browse + matchedExcludedSelf.
  // Sole hit for a real needle → auto-select so Move can arm without a second click.
  useEffect(() => {
    if (!open || success) return;
    const controller = new AbortController();
    const needle = poSearchNeedle(search);
    // Editing the box clears a prior Change-carton dismiss for that needle.
    if (dismissedNeedleRef.current != null && dismissedNeedleRef.current !== needle) {
      dismissedNeedleRef.current = null;
    }
    const timer = window.setTimeout(async () => {
      setPoLoading(true);
      try {
        const params = new URLSearchParams({ limit: '25' });
        if (needle) params.set('search', needle);
        if (thisReceivingId != null) params.set('exclude', String(thisReceivingId));
        const res = await fetch(`/api/receiving/photo-move-targets?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          targets?: PhotoMoveTargetRow[];
          matchedExcludedSelf?: boolean;
        };
        const rows = data.targets ?? [];
        const selfOnly = Boolean(data.matchedExcludedSelf);
        setTargetRows(rows);
        setMatchedExcludedSelf(selfOnly);

        // Unique carton for this search → pick it (skip empty browse + self fallback).
        if (
          needle &&
          !selfOnly &&
          rows.length === 1 &&
          dismissedNeedleRef.current !== needle
        ) {
          setOtherRow(rows[0]!);
          pendingSelectAllPhotosRef.current = true;
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setTargetRows([]);
        setMatchedExcludedSelf(false);
      } finally {
        setPoLoading(false);
      }
    }, needle ? 280 : 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, search, thisReceivingId, success]);

  // Sole-match path arms "select all photos" — apply once the grid has loaded.
  useEffect(() => {
    if (!pendingSelectAllPhotosRef.current) return;
    if (otherReceivingId == null) return;
    if (photos.photos.length === 0) return;
    if (photos.selectedPhotoIds.size > 0) {
      pendingSelectAllPhotosRef.current = false;
      return;
    }
    pendingSelectAllPhotosRef.current = false;
    photos.toggleSelectAll();
  }, [otherReceivingId, photos.photos.length, photos.selectedPhotoIds.size, photos.toggleSelectAll]);

  /** After the success beat: modal dismisses; Displays chrome resets in place. */
  const resetFormAfterSuccess = () => {
    setSuccess(null);
    setOtherRow(null);
    setSearch('');
    setTargetRows([]);
    setMatchedExcludedSelf(false);
    setBusy(false);
    dismissedNeedleRef.current = null;
    pendingSelectAllPhotosRef.current = false;
  };

  const finishAndClose = (beat: SuccessBeat) => {
    setSuccess(beat);
    clearCloseTimer();
    closeTimer.current = setTimeout(
      () => {
        closeTimer.current = null;
        if (chrome === 'display') {
          resetFormAfterSuccess();
          return;
        }
        onClose();
      },
      reduceMotion ? SUCCESS_HOLD_REDUCED_MS : SUCCESS_HOLD_MS,
    );
  };

  const move = async () => {
    if (!targetReceivingId || photos.selectedPhotoIds.size === 0 || busy || success) return;
    if (sourceReceivingId == null) return;
    setBusy(true);
    const ids = [...photos.selectedPhotoIds];
    const movedIds: number[] = [];
    let failed = 0;
    for (const id of ids) {
      try {
        await reassignPhotoToReceiving(id, targetReceivingId);
        movedIds.push(id);
      } catch {
        failed++;
      }
    }
    setBusy(false);
    if (movedIds.length > 0) {
      // Photo-count SoT: optimistic rail camera badge (− source / + destination)
      // + invalidate feeds. dispatchReceivingPhotoChanged already refreshes
      // receiving.lines / receiving.poLines — no bare refreshDomains needed.
      notifyReceivingPhotoChanged(queryClient, {
        action: 'delete',
        receivingId: sourceReceivingId,
        photoIds: movedIds,
      });
      notifyReceivingPhotoChanged(queryClient, {
        action: 'insert',
        receivingId: targetReceivingId,
        photoIds: movedIds,
      });
      onMoved?.();
      if (failed === 0) {
        finishAndClose({
          direction,
          moved: movedIds.length,
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
      ? `Moved ${success.moved}`
      : `Pulled ${success.moved}`
    : '';
  const successDetail = success
    ? success.direction === 'to'
      ? `→ ${success.otherLabel ?? 'carton'}`
      : `← ${success.otherLabel ?? 'carton'}`
    : '';

  return (
    <div className="flex h-full min-h-0 flex-col" data-move-photos-chrome={chrome}>
      {chrome === 'modal' ? (
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
      ) : null}

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
            <div className="min-h-0 flex-1 space-y-0 overflow-y-auto text-role-data">
              {/* Direction — the house child-mode combobox (claim Create|Link
                  face). The flush select owns its own bottom hairline. */}
              <div className="flex shrink-0 flex-col gap-0">
                <SearchableSelectField
                  appearance="flush"
                  value={direction}
                  onChange={(id) => {
                    if (id == null) return;
                    setDirection(id as Direction);
                  }}
                  options={MOVE_DIRECTION_OPTIONS}
                  placeholder="Pick a direction…"
                  searchPlaceholder="Type to filter…"
                  emptyMessage="No directions match"
                  ariaLabel="Move direction"
                />
              </div>

              <div className="space-y-3 py-3">
              {(direction === 'from' || (direction === 'to' && photos.photos.length > 0)) && (
                <div className="space-y-2">
                  <DenseComposeLabel className="px-3" htmlFor="photo-move-search">
                    {direction === 'to' ? 'Target carton / PO' : 'Source carton / PO'}
                  </DenseComposeLabel>
                  <div className="px-3">
                    <div className="relative">
                      <DenseComposeSearchInput
                        id="photo-move-search"
                        type="search"
                        value={search}
                        onChange={(e) => {
                          const next = e.target.value;
                          setSearch(next);
                          // Typing while selected starts a fresh pick.
                          if (otherRow != null) {
                            pendingSelectAllPhotosRef.current = false;
                            setOtherRow(null);
                          }
                        }}
                        placeholder="Purchase order #, tracking #, ticket # / subject, or carton QR…"
                        autoFocus
                        className={search || otherRow ? 'pr-8' : undefined}
                      />
                      {search || otherRow ? (
                        <IconButton
                          type="button"
                          size="xs"
                          ariaLabel="Clear carton search"
                          onClick={clearPicker}
                          icon={<X className="h-3.5 w-3.5" />}
                          className="absolute right-0 top-1/2 -translate-y-1/2"
                        />
                      ) : null}
                    </div>
                    <p className="mt-1 text-role-micro text-text-faint">
                      Type or scan a different carton — not this one.
                    </p>
                  </div>
                  {(matchedExcludedSelf || !poSearchNeedle(search)) &&
                  targetRows.length > 0 ? (
                    <p
                      className="px-3 text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft"
                      data-testid="photo-move-recent-eyebrow"
                    >
                      Recent cartons
                    </p>
                  ) : null}
                  <div className="max-h-48 overflow-y-auto">
                    {poLoading ? (
                      <p className="flex items-center justify-center gap-2 py-6 text-xs text-text-soft">
                        <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                      </p>
                    ) : targetRows.length === 0 ? (
                      <p className="px-3 py-8 text-center text-role-micro text-text-soft">
                        {poSearchNeedle(search)
                          ? 'No matching cartons'
                          : 'Search for another carton to move photos to.'}
                      </p>
                    ) : (
                      targetRows.map((r) => {
                        const isSel = otherRow?.receiving_id === r.receiving_id;
                        return (
                          <button
                            // ds-raw-button: full-row select target; CopyChips stopPropagation on copy
                            key={r.receiving_id}
                            type="button"
                            data-testid="photo-move-target-row"
                            data-receiving-id={r.receiving_id}
                            data-selected={isSel ? 'true' : undefined}
                            data-title={
                              String(r.title || '').trim() || photoMoveTargetLabel(r)
                            }
                            aria-pressed={isSel}
                            onClick={() => {
                              if (isSel) {
                                dismissedNeedleRef.current = poSearchNeedle(search) || null;
                                pendingSelectAllPhotosRef.current = false;
                                setOtherRow(null);
                                return;
                              }
                              setOtherRow(r);
                            }}
                            className={
                              isSel
                                ? 'flex w-full border-b border-border-hairline bg-blue-50 px-3 py-2.5 text-left ring-1 ring-inset ring-blue-400 transition-colors last:border-b-0 hover:bg-blue-50/80'
                                : 'flex w-full border-b border-border-hairline px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface-hover'
                            }
                          >
                            <PhotoMoveTargetFace row={r} />
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {sourceReceivingId != null ? (
                <div className="space-y-2 px-3">
                  {photos.photos.length === 0 ? (
                    <p className="border-y border-dashed border-border-soft px-3 py-8 text-center text-role-micro text-text-soft">
                      No photos on this carton yet.
                    </p>
                  ) : (
                    <ClaimPhotoPicker photos={photos} receivingId={sourceReceivingId} />
                  )}
                </div>
              ) : direction === 'from' ? (
                <p className="mx-3 border-y border-dashed border-border-soft px-3 py-8 text-center text-role-micro text-text-soft">
                  Pick a source carton to see its photos.
                </p>
              ) : null}
              </div>
            </div>

            {/*
              Macro floor — full-bleed primary pinned to the panel bottom.
              Compose FlushTerminalFooter (Claim golden); never inset px/py.
            */}
            <FlushTerminalFooter layout="bleed">
              <Button
                variant="primary"
                size="md"
                className="w-full justify-center"
                loading={busy}
                disabled={!canMove}
                onClick={() => void move()}
                icon={<ArrowLeftRight className="h-4 w-4" />}
              >
                {direction === 'to'
                  ? `Move ${photos.selectedPhotoIds.size || ''}`.trim()
                  : `Pull ${photos.selectedPhotoIds.size || ''}`.trim()}
              </Button>
            </FlushTerminalFooter>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
