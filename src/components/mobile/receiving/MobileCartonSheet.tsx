'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Check, Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCompleteCarton } from '@/components/mobile/receiving/useCompleteCarton';
import { PhotoPolicyOverrideSheet } from '@/components/receiving/PhotoPolicyOverrideSheet';
import { photoPolicyOverrideLabel } from '@/lib/receiving/photo-policy-override-wire';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useCapabilityProviderLabel } from '@/hooks/useCapabilityProviderLabel';
import { MobileReceivingPhotoStrip } from '@/components/mobile/receiving/MobileReceivingPhotoStrip';
import { UnfoundMatchStrip } from '@/components/receiving/workspace/line-edit/UnfoundMatchStrip';
import { OrderIdChip, TrackingChip, getLast8 } from '@/components/ui/CopyChip';
import { operatorAccentClasses } from '@/utils/operator-accent';
import {
  conditionGradeTableLabel,
  getStatusDotBg,
  workflowStatusTableLabel,
} from '@/components/station/receiving-constants';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { EMPTY_META_DASH, EMPTY_META_DASH_ALIGN_CLASS } from '@/lib/conditions';
import { receivingUnboxedSyncTooltip } from '@/lib/receiving/unboxed-sync-tooltip';
import { cn } from '@/utils/_cn';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { receivingLinePhotoHrefs } from '@/lib/photos/mobile-gallery-url';

interface MobileCartonSheetProps {
  row: ReceivingLineRow | null;
  staffId: number;
  open: boolean;
  onClose: () => void;
}

/**
 * Receive actions wear the OPERATOR ACCENT, matching the desktop bench.
 *
 * The desktop Print · Receive dock renders `tone: 'accent'` → `bg-accent-bg`
 * (`SlicedActionDock`), which resolves to the staff's own identity colour — it
 * is not a fixed green. Hardcoding emerald here would match one operator's
 * desktop today and drift for every other staffer and tenant, so this composes
 * the same token instead. `text-white` comes from the Button's primary variant;
 * the accent classes only override its blue fill (accent-bg pairs with white /
 * text-inverse per the token contract).
 */
const ACCENT_CTA = `${operatorAccentClasses.bg} ${operatorAccentClasses.hover} active:bg-accent-bg/80`;

/**
 * Receive CTA + its outcome, as ONE region that swaps state in place.
 *
 * Station law (`.claude/rules/display/station.md` §6): pass/fail is a big card
 * state, not a corner toast — an operator three feet from a phone with their
 * hands in a box does not see a 3.5s toast. So success stays on screen until
 * dismissed, and a photo-policy block renders its blockers as a fixable amber
 * state (the operator leaves, shoots the missing photos, comes back, taps
 * again) rather than a red failure.
 */
function CompleteCartonAction({
  complete,
}: {
  complete: ReturnType<typeof useCompleteCarton>;
}) {
  // The waiver sheet stacks over the carton sheet (level 1) — the operator is
  // mid-task on this carton, so the acknowledgement belongs on top of it, not
  // on a screen they had to navigate to.
  const [overrideOpen, setOverrideOpen] = useState(false);
  const { label: inventoryProviderLabel } = useCapabilityProviderLabel('inventory');

  if (complete.phase === 'done') {
    const lineSuffix =
      complete.updatedCount > 0
        ? ` · ${complete.updatedCount} line${complete.updatedCount === 1 ? '' : 's'}`
        : '';

    // The external receive runs after the response, so a green check here would
    // be a claim we haven't earned. Wait for the same verdict the desktop bench
    // reconciles against, and say what IS true meanwhile: received locally.
    if (complete.awaitsSync && complete.syncStatus === 'pending') {
      return (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-4 py-4 text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          <span className="text-sm font-semibold">
            Carton received{lineSuffix} · saving to {inventoryProviderLabel}…
          </span>
        </div>
      );
    }

    // Locally committed, external receive rejected. Not a rollback — the units
    // are received — so this is an amber retry, never a red failure.
    if (complete.syncStatus === 'failed') {
      return (
        <div className="flex flex-col gap-2">
          <div className="rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-inset ring-amber-200">
            <p className="text-role-caption font-semibold uppercase tracking-widest text-amber-700">
              Received · {inventoryProviderLabel} not updated
            </p>
            <p className="mt-1 text-role-caption font-semibold text-amber-800">
              The carton is received here, but saving it to {inventoryProviderLabel} failed. Retry,
              or finish it on the desktop bench.
            </p>
          </div>
          <Button
            variant="primary"
            size="lg"
            onClick={() => void complete.run()}
            className={cn('h-14 w-full rounded-2xl', ACCENT_CTA)}
          >
            Retry {inventoryProviderLabel} save
          </Button>
        </div>
      );
    }

    // Received on a photo-policy waiver. Amber, not green: the carton IS
    // received, but it carries an open exception, and this is the last moment
    // the operator who took that call can see it named.
    if (complete.waiver) {
      return (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-inset ring-amber-200">
          <p className="text-role-caption font-semibold uppercase tracking-widest text-amber-700">
            Received without photos{lineSuffix}
          </p>
          <p className="mt-1 text-role-caption font-semibold text-amber-800">
            Logged as an exception · {photoPolicyOverrideLabel(complete.waiver.reasonCode)}
          </p>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-4 py-4 text-emerald-700 ring-1 ring-inset ring-emerald-200">
        <Check className="h-5 w-5 shrink-0" />
        <span className="text-sm font-semibold">Carton received{lineSuffix}</span>
      </div>
    );
  }

  const working = complete.phase === 'working';
  const retrying = complete.phase === 'blocked' || complete.phase === 'error';

  return (
    <div className="flex flex-col gap-2">
      {complete.phase === 'blocked' ? (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-inset ring-amber-200">
          <p className="text-role-caption font-semibold uppercase tracking-widest text-amber-700">
            Photos needed first
          </p>
          <ul className="mt-1.5 space-y-1">
            {complete.blockers.map((b) => (
              <li key={b} className="text-role-caption font-semibold text-amber-800">
                {b}
              </li>
            ))}
          </ul>
          {/* The soft block's escape hatch. Deliberately quiet and secondary:
              shooting the photos is the primary path, and this one costs the
              operator a named reason on the carton's exception list. */}
          <Button
            variant="secondary"
            size="md"
            onClick={() => setOverrideOpen(true)}
            disabled={working}
            className="mt-2.5 w-full"
          >
            Receive without photos…
          </Button>
        </div>
      ) : null}

      {complete.phase === 'error' ? (
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-center text-role-caption font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
          {complete.error}
        </p>
      ) : null}

      <Button
        variant="primary"
        size="lg"
        onClick={() => void complete.run()}
        disabled={working}
        className={cn('h-14 w-full rounded-2xl', ACCENT_CTA)}
      >
        {working ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Receiving…
          </span>
        ) : retrying ? (
          'Try again'
        ) : (
          'Complete carton'
        )}
      </Button>

      <PhotoPolicyOverrideSheet
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        blockers={complete.blockers}
        busy={working}
        level={1}
        onConfirm={(code) => {
          setOverrideOpen(false);
          void complete.run(code);
        }}
      />
    </div>
  );
}

/**
 * Phone-tuned sheet for a single receiving line. Mobile is photo-only — no
 * editor fields, no form. Header mirrors {@link MobileReceivingRow}: title +
 * qty • condition on the left (workflow icon suppressed on history/unbox feed),
 * copy chips stacked on the right. {@link MobileReceivingPhotoStrip} shows all
 * captured thumbs; tapping opens the shared swipe viewer.
 * The CTA hands off to the dedicated camera route at /m/r/{id}/photos.
 */
export function MobileCartonSheet({ row, staffId, open, onClose }: MobileCartonSheetProps) {
  // Hooks run before the `!row` guard — the sheet renders null between rows and
  // React would otherwise see a changing hook count.
  const queryClient = useQueryClient();
  const complete = useCompleteCarton(row);
  const { label: inventoryProviderLabel } = useCapabilityProviderLabel('inventory');
  const { reset: resetComplete, phase: completePhase } = complete;
  const rowId = row?.id ?? null;

  // A fresh carton must never inherit the previous one's success/blocked state.
  useEffect(() => {
    resetComplete();
  }, [rowId, resetComplete]);

  // The route's own invalidate + realtime publish fire in `after()` (behind the
  // Zoho round-trip), so refresh this device's feeds immediately on the local
  // commit. `invalidateReceivingFeeds` stamps the local invalidation so the Ably
  // echo of this same receive de-dupes instead of refetching twice.
  useEffect(() => {
    if (completePhase !== 'done') return;
    invalidateReceivingFeeds(queryClient);
  }, [completePhase, queryClient]);

  if (!row) return null;

  const receivingId = row.receiving_id;
  const productTitle = row.item_name || row.zoho_item_id || 'Unnamed inbound line';
  const poValue = (row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').trim();
  const trackingValue = (row.tracking_number || '').trim();
  const qtyExpected = row.quantity_expected ?? 0;
  const qtyReceived = row.quantity_received;
  const photoCount = row.photo_count ?? 0;
  const quantityText = `${qtyReceived}/${row.quantity_expected ?? '?'}`;
  const workflowLabel = workflowStatusTableLabel(row.workflow_status || 'EXPECTED');
  const statusDotTip =
    receivingUnboxedSyncTooltip({
      workflowStatus: row.workflow_status,
      inventoryProviderLabel,
    }) ?? workflowLabel;
  const conditionLabel = conditionGradeTableLabel(row.condition_grade);
  const condGrade = (row.condition_grade || '').toUpperCase();

  const { captureHref: photosHref, galleryHref } = receivingLinePhotoHrefs({
    receivingId,
    lineId: row.id,
    itemName: row.item_name,
    sku: row.sku,
    zohoItemId: row.zoho_item_id,
    poRef: poValue || undefined,
    back: '/m/receiving',
  });

  return (
    <BottomSheet open={open} onClose={onClose} maxWidth="32rem">
      <div className="flex flex-col gap-4">
        {/* Header — mirrors MobileReceivingRow: title + meta on the left, chips on the right. */}
        <div className="flex flex-col gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <HoverTooltip label={statusDotTip} asChild>
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${getStatusDotBg(row.workflow_status, qtyReceived, row.quantity_expected)}`}
              />
            </HoverTooltip>
            <div className="line-clamp-2 text-sm font-semibold text-text-default">
              {productTitle}
            </div>
          </div>

          <div className="flex items-center gap-2 pl-4">
            <span className="flex shrink-0 items-center gap-1 text-role-caption font-semibold uppercase tracking-widest">
              <span
                className={
                  qtyExpected > 1 && qtyReceived < qtyExpected
                    ? 'text-text-warning'
                    : row.quantity_expected && qtyReceived >= row.quantity_expected
                      ? 'text-emerald-600'
                      : 'text-text-muted'
                }
              >
                {quantityText}
              </span>
              <span className="text-text-faint">•</span>
              <span
                className={cn(
                  conditionGradeTextClass(condGrade),
                  conditionLabel === EMPTY_META_DASH && EMPTY_META_DASH_ALIGN_CLASS,
                )}
              >
                {conditionLabel}
              </span>
            </span>

            {/* No serial chip: a carton's serials render as one comma-joined
                value, so a multi-unit carton blows the row out. Serials stay on
                the surfaces that show them per unit. */}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <OrderIdChip value={poValue} display={getLast8(poValue)} />
              <TrackingChip value={trackingValue} display={getLast8(trackingValue)} />
            </div>
          </div>
        </div>

        {receivingId != null && row.receiving_source === 'unmatched' ? (
          <UnfoundMatchStrip
            receivingId={receivingId}
            trackingNumber={trackingValue || null}
            showTopRule={false}
          />
        ) : null}

        {/* Existing photos */}
        {receivingId && galleryHref !== '#' ? (
          <MobileReceivingPhotoStrip
            receivingId={receivingId}
            staffId={staffId}
            galleryHref={galleryHref}
            countHint={photoCount}
            onNavigate={onClose}
          />
        ) : receivingId ? null : (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-center text-role-caption font-semibold text-amber-700">
            No package id yet — scan tracking from desktop first.
          </p>
        )}

        {/* Primary CTA — hands off to dedicated capture surface */}
        {photosHref !== '#' ? (
          <Link
            href={photosHref}
            prefetch={false}
            onClick={onClose}
            aria-label={`Take photos (${photoCount} so far)`}
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm transition-colors active:bg-blue-700"
          >
            <Camera className="h-6 w-6" />
          </Link>
        ) : null}

        {/* Complete carton — receives every open line under this carton. */}
        {receivingId ? <CompleteCartonAction complete={complete} /> : null}
      </div>
    </BottomSheet>
  );
}
