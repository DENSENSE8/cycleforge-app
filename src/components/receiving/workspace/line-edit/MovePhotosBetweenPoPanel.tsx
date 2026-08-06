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
import { TabDisplay } from '@/design-system/components';
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
import { toast } from '@/lib/toast';
import { reassignPhotoToReceiving } from '@/components/shipped/photo-gallery/photo-gallery-api';
import { notifyReceivingPhotoChanged } from '@/lib/queries/receiving-queries';
import { useClaimPhotos } from '../claim/hooks/useClaimPhotos';
import { ClaimPhotoPicker } from '../claim/components/ClaimPhotoPicker';
import { parsePoListSearch } from '@/lib/receiving/po-list-search';
import { photoMoveTargetLabel } from '@/lib/receiving/photo-move-targets-shared';
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

interface SuccessBeat {
  direction: Direction;
  moved: number;
  otherLabel: string | null;
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
   * `display` — Unbox Displays Photos→Move: strip + Browse·Move·Send tabs already
   * name the verb; omit icon+title band and X (column `→|` owns dismiss).
   * `modal` — right-rail / overlay hosts keep the title + close.
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
      setTargetRows([]);
      setMatchedExcludedSelf(false);
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
    setTargetRows([]);
    setMatchedExcludedSelf(false);
  }, [direction, success]);

  // Carton search — any receiving carton (PO-bearing, unmatched, ticket-linked).
  // Accepts PO #, tracking #, ticket #, and carton QR handles (`R-<id>` / `#R-<id>`).
  // Self-match (needle is this carton) → server returns recent browse + matchedExcludedSelf.
  useEffect(() => {
    if (!open || success) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPoLoading(true);
      try {
        const params = new URLSearchParams({ limit: '25' });
        const needle = poSearchNeedle(search);
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
        setTargetRows(data.targets ?? []);
        setMatchedExcludedSelf(Boolean(data.matchedExcludedSelf));
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setTargetRows([]);
        setMatchedExcludedSelf(false);
      } finally {
        setPoLoading(false);
      }
    }, poSearchNeedle(search) ? 280 : 0);
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
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-3 text-role-data">
              <div className="px-3">
                <TabDisplay
                  tabs={[
                    { id: 'to', label: 'To another carton' },
                    { id: 'from', label: 'From another carton' },
                  ]}
                  activeTab={direction}
                  onTabChange={(id) => setDirection(id as Direction)}
                  appearance="segment"
                  fit="fill"
                  aria-label="Move direction"
                />
              </div>

              {(direction === 'from' || (direction === 'to' && photos.photos.length > 0)) && (
                <div className="space-y-2">
                  <DenseComposeLabel className="px-3" htmlFor="photo-move-search">
                    {direction === 'to' ? 'Target carton / PO' : 'Source carton / PO'}
                    {otherLabel ? ` · ${otherLabel}` : ''}
                  </DenseComposeLabel>
                  {!otherReceivingId ? (
                    <>
                      <div className="px-3">
                        <DenseComposeSearchInput
                          id="photo-move-search"
                          type="search"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="PO #, tracking #, ticket # / subject, or carton QR…"
                          autoFocus
                        />
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
                            const label = photoMoveTargetLabel(r);
                            const poValue = String(r.po_number || r.po_id || '').trim();
                            const tracking = (r.tracking_number || '').trim();
                            const ticketDigits =
                              r.ticket_id != null && r.ticket_id > 0
                                ? String(r.ticket_id)
                                : '';
                            const ticketFace = (
                              r.ticket_external_id ||
                              ticketDigits
                            ).trim();
                            const title = String(r.title || '').trim() || label;
                            const isUnfoundPo =
                              title === 'Unfound PO' || r.source === 'unmatched';
                            // Carton handle when there's no PO, or always for Unfound
                            // stubs (ticket alone must not hide R-{id}).
                            const showCartonHandle = !poValue || isUnfoundPo;
                            return (
                              <button
                                // ds-raw-button: full-row select target; CopyChips stopPropagation on copy
                                key={r.receiving_id}
                                type="button"
                                data-testid="photo-move-target-row"
                                data-receiving-id={r.receiving_id}
                                data-title={title}
                                onClick={() => {
                                  setOtherReceivingId(r.receiving_id);
                                  setOtherLabel(label);
                                }}
                                className="flex w-full items-center justify-between gap-3 border-b border-border-hairline px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface-hover"
                              >
                                <div className="flex min-w-0 w-full flex-col items-start gap-1">
                                  <span className="line-clamp-2 break-words text-role-body font-medium text-text-primary">
                                    {title}
                                  </span>
                                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                    {poValue ? <PoChip value={poValue} dense /> : null}
                                    {showCartonHandle ? (
                                      <OrderIdChip
                                        value={`R-${r.receiving_id}`}
                                        display={getLast8(`R-${r.receiving_id}`)}
                                        dense
                                      />
                                    ) : null}
                                    {tracking ? (
                                      <TrackingChip value={tracking} dense />
                                    ) : null}
                                  </div>
                                  {ticketDigits ? (
                                    <TicketChip
                                      value={ticketDigits}
                                      display={ticketFace}
                                      dense
                                    />
                                  ) : null}
                                </div>
                                <Package className="h-4 w-4 shrink-0 text-text-faint" />
                              </button>
                            );
                          })
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
                      className="px-3 text-role-eyebrow font-semibold uppercase tracking-widest text-blue-600 hover:underline"
                    >
                      Change carton
                    </button>
                  )}
                </div>
              )}

              {sourceReceivingId != null ? (
                <div className="space-y-2 px-3">
                  <div className="flex items-center justify-between">
                    <p className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
                      {direction === 'to' ? 'Photos on this carton' : 'Photos on source carton'}
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
