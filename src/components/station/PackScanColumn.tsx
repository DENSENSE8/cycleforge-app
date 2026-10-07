'use client';

import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-presets-hooks';
import { AlertCircle, Archive, MapPin, Package, ScanBarcode } from '../Icons';
import { useStationTheme } from '@/hooks/useStationTheme';
import { useLast8TrackingSearch } from '@/hooks/useLast8TrackingSearch';
import { formatPSTTimestamp } from '@/utils/date';
import {
  ScanBandShell,
  StationScanModeRail,
  ThemedStationScanBar,
  isScanPreview,
  useScanModeRelease,
  useScanStance,
  type StationScanModeDefinition,
} from '@/components/station/scan-bar';
import { composeStationScanBarRightContent } from '@/components/station/scan-bar/station-scan-preview-rail';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import { looksLikeFnsku } from '@/lib/scan-resolver';
import { routeScan, scannedUnitKey, unwrapScannedSerial } from '@/lib/barcode-routing';
import type { PackScanMode } from '@/lib/packing/pack-scan-mode';
import { useRegisterScanSink } from '@/lib/station-scan-sink';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import { STATION_SKILL } from '@/lib/assistant/page-skills';
import {
  dispatchPackActiveFba,
  dispatchPackActiveOrder,
} from '@/components/packer/usePackerOrderPane';
import {
  dispatchPackPrintBundleUi,
  PACKER_FOCUS_SCAN_EVENT,
  triggerPackPrintBundle,
} from '@/lib/print/pack-print-bundle-client';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyClient } from '@/contexts/AblyContext';
import { safeChannelName, getStaffStationBridgeChannelName } from '@/lib/realtime/channels';
import { useUnitPhotoRequestPublisher } from '@/hooks/useUnitPhotoRequestPublisher';
import { toast } from '@/lib/toast';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { sendWithBuyerNoteAck } from '@/lib/orders/buyer-note-ack-client';

interface ActivePackingOrder {
  orderRowId: number | null;
  orderId: string;
  productTitle: string;
  qty: number;
  condition: string;
  tracking: string;
  scanType?: 'ORDERS' | 'REPAIR' | 'UNIT';
  sku?: string;
  serialUnitId?: number | null;
  unitKey?: string | null;
  packerLogId?: number | null;
  /** Exception Path B — tracking not found in orders. */
  isUnknownOrder?: boolean;
}

type PackMode = 'standard' | 'fragile' | 'multi';

/** Packing's manual lookups — each searches ONE identifier kind (`@/lib/packing/pack-scan-mode`). */
const PACK_SCAN_MODES: readonly StationScanModeDefinition<PackScanMode>[] = [
  { mode: 'tracking', label: 'Tracking', Icon: MapPin, armedClass: 'text-blue-700' },
  { mode: 'tote', label: 'Tote', Icon: Archive, armedClass: 'text-amber-700' },
  { mode: 'serial', label: 'Serial', Icon: ScanBarcode, armedClass: 'text-emerald-700' },
  { mode: 'fnsku', label: 'FNSKU', Icon: Package, armedClass: 'text-violet-700' },
];

const PACK_SCAN_MODE_FULL_LABEL: Record<PackScanMode, string> = {
  tracking: 'Tracking #',
  tote: 'Tote',
  serial: 'Unit label / serial',
  fnsku: 'FNSKU',
};

const PACK_MODE_LABELS: Record<PackMode, string> = {
  standard: 'Standard',
  fragile: 'Fragile — extra bubble wrap, double-box if needed',
  multi: 'Multi-item — verify all items before sealing',
};

interface PackScanColumnProps {
  userId: string;
  userName: string;
  staffId: number | string;
  onComplete?: () => void;
  /** Current pack mode selected in the sidebar mode rail. */
  packMode?: PackMode;
  /** Recent-activity rail rendered below the scan band (the sidebar's `PackRecentPacksRail`). */
  railSlot: ReactNode;
}

export default function PackScanColumn({
  userId,
  userName,
  staffId,
  onComplete,
  packMode = 'standard',
  railSlot,
}: PackScanColumnProps) {
  // Global-assistant context: station Q&A skill fragment (plan §-2.2).
  useAssistantContext({ page: 'packing-station', station: 'PACKING', skill: STATION_SKILL });
  const cardPresence = useMotionPresence(motionPresence.stationCard);
  const cardTransition = useMotionTransition(motionTransition.stationCardMount);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActivePackingOrder | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Middle-pane Reprint / other pack pointer controls hand focus back here.
  useEffect(() => {
    const handler = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener(PACKER_FOCUS_SCAN_EVENT, handler);
    return () => window.removeEventListener(PACKER_FOCUS_SCAN_EVENT, handler);
  }, []);

  // The pack checklist + policy fetches that used to sit here fed the sidebar's own `OrderPackChecklist`, which was dead under `railSlot`…

  // Mutual exclusion between the order and FBA panes is owned by `usePackerOrderPane` (one dispatch clears the other), so this effect only…
  useEffect(() => {
    if (!activeOrder) {
      dispatchPackActiveOrder(null);
      return;
    }
    dispatchPackActiveOrder({
      orderRowId: activeOrder.orderRowId,
      orderId: activeOrder.orderId,
      productTitle: activeOrder.productTitle,
      qty: activeOrder.qty,
      condition: activeOrder.condition,
      tracking: activeOrder.tracking,
      sku: activeOrder.sku,
      scanType: activeOrder.scanType,
      serialUnitId: activeOrder.serialUnitId,
      unitKey: activeOrder.unitKey,
      packerLogId: activeOrder.packerLogId,
      scanDriven: true,
      isUnknownOrder: activeOrder.isUnknownOrder,
    });
  }, [activeOrder]);

  const { theme: themeColor } = useStationTheme({ staffId });
  const stance = useScanStance();
  // Armed lookup — one-shot like Picker: the next submit searches only this
  // kind, then the bar falls back to Auto. Esc on the field releases it.
  const [armedMode, setArmedMode] = useState<PackScanMode | null>(null);
  const releaseArmedMode = useCallback(() => setArmedMode(null), []);
  useScanModeRelease(armedMode != null, releaseArmedMode);
  const { normalizeTracking } = useLast8TrackingSearch();

  const { user } = useAuth();
  const authOrgId = user?.organizationId;
  const authStaffId = user?.staffId ?? 0;
  const { getClient: getAblyClient } = useAblyClient();
  const unitPhotoChannelName = safeChannelName(() =>
    getStaffStationBridgeChannelName(authOrgId!, authStaffId),
  );
  const publishUnitPhotoRequest = useUnitPhotoRequestPublisher({
    staffIdNum: authStaffId,
    getAblyClient,
    stationChannelName: unitPhotoChannelName,
  });
  // Prepack unit QR — a unit label on no open order: attach packing photos to the prepacked unit.
  const startPrepackUnit = async (unitKey: string, priorPackerLogId: number | null) => {
    const unitRes = await fetch(`/api/serial-units/${encodeURIComponent(unitKey)}`);
    const unitData = await unitRes.json().catch(() => null);
    if (!unitRes.ok || !unitData?.success || !unitData?.serial_unit) {
      throw new Error(unitData?.error || 'Unit label not found');
    }
    const unit = unitData.serial_unit as {
      id: number;
      serial_number?: string;
      unit_uid?: string | null;
      sku?: string | null;
      condition_grade?: string | null;
      product_title?: string | null;
    };
    const serialUnitId = Number(unit.id);
    const displayKey =
      String(unit.unit_uid || unit.serial_number || unitKey).trim() || unitKey;
    const sku = String(unit.sku || '').trim();

    setActiveOrder({
      orderRowId: null,
      orderId: displayKey,
      productTitle:
        String(unit.product_title || '').trim() ||
        (sku ? `Prepack · ${sku}` : `Unit ${displayKey}`),
      qty: 1,
      condition: String(unit.condition_grade || '—').trim() || '—',
      tracking: '',
      scanType: 'UNIT',
      sku: sku || undefined,
      serialUnitId,
      unitKey: displayKey,
      packerLogId: priorPackerLogId,
    });

    await publishUnitPhotoRequest({
      serialUnitId,
      unitKey: displayKey,
      stage: 'packing',
      packerLogId: priorPackerLogId,
      poRef: sku || displayKey,
    });
    toast.success('Prepack unit ready', {
      description: 'Phone camera opened for packing photos.',
    });
    onComplete?.();
  };

  const handleSubmit = async (eventOrRaw?: React.FormEvent | string, mode: PackScanMode | null = armedMode) => {
    if (eventOrRaw && typeof eventOrRaw !== 'string') eventOrRaw.preventDefault();
    const scan =
      typeof eventOrRaw === 'string' ? eventOrRaw.trim() : inputValue.trim();
    if (!scan || isLoading) return;
    if (mode) setArmedMode(null);

    // §1b dual-link:
    const priorPackerLogId =
      activeOrder &&
      activeOrder.scanType === 'ORDERS' &&
      typeof activeOrder.packerLogId === 'number' &&
      activeOrder.packerLogId > 0
        ? activeOrder.packerLogId
        : null;

    setIsLoading(true);
    setErrorMessage(null);
    setActiveOrder(null);
    dispatchPackActiveFba(null);
    dispatchPackPrintBundleUi(null);

    try {
      // A unit label (or a tote) first tries the order it is on: pack + print.
      // Only a unit on no open order falls back to the prepack photo path.
      // An armed tracking / tote / FNSKU lookup never reads the scan as a unit.
      const unitKey = mode === null || mode === 'serial' ? scannedUnitKey(scan) : null;

      // ── FBA path: FNSKU (auto by shape, or the armed FNSKU lookup) ─────────
      if (mode === 'fnsku' && !looksLikeFnsku(scan)) {
        setErrorMessage(`${scan} is not an FNSKU`);
      } else if (mode === 'fnsku' || (mode === null && !unitKey && looksLikeFnsku(scan))) {
        const res = await fetch('/api/fba/items/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // staff_id is server-derived from the session cookie now.
          body: JSON.stringify({ fnsku: scan, station: 'PACK_STATION' }),
        });
        const data = await res.json();

        if (!res.ok) {
          setErrorMessage(data?.error || 'FBA scan failed');
        } else {
          dispatchPackActiveFba({
            fnsku: data.fnsku,
            productTitle: data.product_title || scan,
            shipmentRef: data.shipment_ref || null,
            plannedQty: Number(data.planned_qty ?? data.expected_qty ?? 0),
            combinedPackScannedQty: Number(
              data.combined_pack_scanned_qty ?? data.actual_qty ?? 0
            ),
            isNew: !!data.is_new || !!data.auto_added_to_plan,
          });
          onComplete?.();
          refreshDomains(REFRESH_BUNDLES.outboundOrderWrite);
        }
      } else {
        // ── Regular packing path ───────────────────────────────────────────
        // Pre-normalize: strip USPS IMpb routing prefix (420+ZIP) for tracking inputs.
        // Special commands (clean/FBA-) pass through raw.
        const isTrackingInput = !/^(clean|fba-)/i.test(scan);

        // FBA combined-shipment ship-on-scan — a tracking lookup (auto or armed
        // Tracking), never a unit label or a tote plate:
        if (
          (mode === null || mode === 'tracking') &&
          isTrackingInput &&
          !unitKey &&
          routeScan(scan)?.type !== 'handling-unit'
        ) {
          const shipRes = await fetch('/api/fba/shipments/mark-shipped', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scan }),
          });
          if (shipRes.status !== 404) {
            const shipData = await shipRes.json().catch(() => ({} as any));
            if (!shipRes.ok || !shipData?.success) {
              throw new Error(shipData?.error || 'FBA ship-on-scan failed');
            }
            const shippedRef =
              shipData.affected_shipments?.[0] != null
                ? `#${shipData.affected_shipments[0]}`
                : String(shipData.tracking_number || scan);
            dispatchPackActiveFba({
              fnsku: '',
              productTitle: 'FBA Shipment — Shipped',
              shipmentRef: shippedRef,
              plannedQty: Number(shipData.marked_shipped ?? 0),
              combinedPackScannedQty: Number(shipData.marked_shipped ?? 0),
              isNew: false,
            });
            onComplete?.();
            refreshDomains(REFRESH_BUNDLES.outboundOrderWrite);
            return;
          }
        }

        const normalizedScan = isTrackingInput ? normalizeTracking(scan) : scan;
        // A held order (buyer note) opens the note first; acknowledging it
        // re-sends the scan under a fresh key — see sendWithBuyerNoteAck.
        const res = await sendWithBuyerNoteAck(() => {
          const idempotencyKey = safeRandomUUID();
          return fetch('/api/packing-logs', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify({
              trackingNumber: normalizedScan,
              // Tote codes and unit labels resolve on the scan as made.
              rawScan: scan,
              // Armed lookup: the server searches only this identifier kind.
              mode: mode ?? 'auto',
              photos: [],
              packerId: String(userId),
              packerName: userName,
              createdAt: formatPSTTimestamp(),
              idempotencyKey,
            }),
          });
        });
        const data = await res.json();
        if (res.status === 404 && data?.unitNotOnOrder) {
          await startPrepackUnit(String(data?.unitKey || unitKey || unwrapScannedSerial(scan)), priorPackerLogId);
          return;
        }
        if (!res.ok) throw new Error(data?.error || 'Failed to save packing scan');

        const resolvedScanType = String(data?.trackingType || '').trim() || 'ORDERS';
        if (resolvedScanType === 'FBA' && data?.fba) {
          // UPS tracking matched an FBA shipment — show as FBA card.
          dispatchPackActiveFba({
            fnsku: String(data.fba.fnskus || '').split(',')[0]?.trim() || '',
            productTitle: String(data?.productTitle || '').trim() || 'FBA Shipment',
            shipmentRef: data.fba.shipment_ref || null,
            plannedQty: Number(data.fba.total_qty ?? 0),
            combinedPackScannedQty: Number(data.fba.total_qty ?? 0),
            isNew: false,
          });
        } else if (resolvedScanType === 'ORDERS') {
          const orderRowIdRaw = Number(data?.orderRowId);
          const packerLogIdRaw = Number(data?.packerRecord?.id);
          const orderId = String(data?.orderId || '').trim();
          const orderRowId =
            Number.isFinite(orderRowIdRaw) && orderRowIdRaw > 0 ? orderRowIdRaw : null;
          // Exception Path B: API returns a warning and no order identity.
          const isUnknownOrder =
            Boolean(String(data?.warning || '').trim()) || (!orderId && !orderRowId);
          setActiveOrder({
            orderRowId,
            orderId,
            productTitle: isUnknownOrder
              ? 'Unknown order'
              : String(data?.productTitle || '').trim() || 'Unknown product',
            qty: Math.max(1, Number(data?.qty ?? data?.quantity ?? data?.orderQty ?? 1) || 1),
            condition: String(data?.condition || '').trim() || '—',
            tracking: String(data?.shippingTrackingNumber || scan).trim(),
            scanType: 'ORDERS',
            sku: String(data?.sku || '').trim() || undefined,
            packerLogId:
              Number.isFinite(packerLogIdRaw) && packerLogIdRaw > 0 ? packerLogIdRaw : null,
            isUnknownOrder,
          });

          // JIT pack Phase 1 — PoPC after ORDERS pack (not unknown).
          // Status + Reprint render in PackOrderPanel (middle), not this column.
          if (
            !isUnknownOrder &&
            orderRowId &&
            data?.printBundleSuggested
          ) {
            const packerLogId =
              Number.isFinite(packerLogIdRaw) && packerLogIdRaw > 0
                ? packerLogIdRaw
                : null;
            dispatchPackPrintBundleUi({
              status: 'printing',
              missingTypes: [],
              message: 'Printing packing papers…',
              orderRowId,
              packerLogId,
            });
            void triggerPackPrintBundle({
              orderRowId,
              packerLogId,
            }).then(dispatchPackPrintBundleUi);
          }
        }

        onComplete?.();
        // The rail refetches through the refresh bus (`packer.logs`) — the
        // server stamps this scan's activity row at the scan instant.
        refreshDomains(REFRESH_BUNDLES.outboundOrderWrite);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Scan failed');
    } finally {
      setInputValue('');
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const toggleMode = (mode: PackScanMode) => {
    const next = armedMode === mode ? null : mode;
    setArmedMode(next);
    // Arming with a value already in the field runs that lookup now (Picker parity).
    if (next && inputValue.trim() && !isScanPreview()) {
      void handleSubmit(inputValue, next);
      return;
    }
    queueMicrotask(() => inputRef.current?.focus());
  };

  useRegisterScanSink({
    id: 'pack-scan-bar',
    enabled: true,
    onScan: (raw) => {
      void handleSubmit(raw);
    },
    focus: () => inputRef.current?.focus(),
  });

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-card">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Flush 40px scan band — same ScanBandShell + rail leading column as Unbox / Testing / Shipping. */}
        <ScanBandShell themeColor={themeColor}>
          <ThemedStationScanBar
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            inputRef={inputRef}
            staffId={staffId}
            placeholder={
              stance === 'preview'
                ? ''
                : armedMode
                  ? `Scan ${PACK_SCAN_MODE_FULL_LABEL[armedMode]}`
                  : 'Tracking \u00b7 Tote \u00b7 Serial \u00b7 FNSKU'
            }
            // Align icon/text to SIDEBAR_SCAN_DOCK_LEADING_ROW (Unbox/Testing SoT) — not MasterNav deep inset.
            leadingColumn="rail"
            autoFocus
            isResolving={isLoading}
            className="w-full"
            rightContent={composeStationScanBarRightContent(
              stance,
              undefined,
              <StationScanModeRail
                modes={PACK_SCAN_MODES}
                armedMode={armedMode}
                onToggleMode={toggleMode}
                size="compact"
                getAriaLabel={(m, armed) => {
                  const full = PACK_SCAN_MODE_FULL_LABEL[m.mode];
                  return armed
                    ? `${full} armed for next scan. Click again to auto-detect.`
                    : `Arm ${full}: force the next scan to search ${full}.`;
                }}
                getTitle={(m, armed) => {
                  const full = PACK_SCAN_MODE_FULL_LABEL[m.mode];
                  return armed
                    ? `${full} armed \u2014 next scan. Click again to auto-detect.`
                    : `Search by ${full}`;
                }}
              />,
            )}
          />
        </ScanBandShell>

        {/* Pack mode — the `?packMode=` child page, spelled out. */}
        {packMode !== 'standard' ? (
          <div className="border-b border-border-hairline bg-amber-50 px-3 py-2">
            <p className="rounded-none text-role-caption font-semibold text-amber-800">
              {PACK_MODE_LABELS[packMode]}
            </p>
          </div>
        ) : null}

        {/* Phone photo-request STATUS panels used to live here. */}

        {/* Transient scan feedback. With a rail below it this band is
            content-height (`shrink-0`) and the rail owns the scroll port —
            one scrolling region per column, same as the Unbox sidebar. */}
        <div className="shrink-0">
          <AnimatePresence mode="wait">
            {errorMessage && (
              <motion.div
                {...cardPresence}
                transition={cardTransition}
                className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-3 py-2.5 text-red-700"
              >
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p className="text-xs font-semibold">{errorMessage}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* The FBA scan card and the active-order card BOTH left this column on 2026-08-02. */}
        </div>

        {/* Recent-activity rail — the single scroll port of this column. */}
        {railSlot ? <SidebarRailScrollport>{railSlot}</SidebarRailScrollport> : null}
      </div>
    </div>
  );
}
