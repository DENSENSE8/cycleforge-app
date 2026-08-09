'use client';

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { Barcode, AlertCircle } from '../Icons';
import { useStationTheme } from '@/hooks/useStationTheme';
import { useLast8TrackingSearch } from '@/hooks/useLast8TrackingSearch';
import { formatPSTTimestamp } from '@/utils/date';
import { ThemedStationScanBar } from '@/components/station/scan-bar';
import { ScanBandShell } from '@/components/station/scan-bar';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import { looksLikeFnsku } from '@/lib/scan-resolver';
import { scannedUnitKey } from '@/lib/barcode-routing';
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
} from '@/components/packer/pack-print-bundle';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyClient } from '@/contexts/AblyContext';
import { safeChannelName, getStaffStationBridgeChannelName } from '@/lib/realtime/channels';
import { useUnitPhotoRequestPublisher } from '@/components/sidebar/receiving/useUnitPhotoRequestPublisher';
import { toast } from '@/lib/toast';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';
import { safeRandomUUID } from '@/lib/safe-uuid';

interface ActivePackingOrder {
  orderRowId: number | null;
  orderId: string;
  productTitle: string;
  qty: number;
  condition: string;
  tracking: string;
  scanType?: 'ORDERS' | 'SKU' | 'REPAIR' | 'UNIT';
  sku?: string;
  serialUnitId?: number | null;
  unitKey?: string | null;
  packerLogId?: number | null;
  /** Exception Path B — tracking not found in orders. */
  isUnknownOrder?: boolean;
}

type PackMode = 'standard' | 'fragile' | 'multi';

const PACK_MODE_LABELS: Record<PackMode, string> = {
  standard: 'Standard',
  fragile: 'Fragile — extra bubble wrap, double-box if needed',
  multi: 'Multi-Item — verify ALL items before sealing',
};

interface PackScanColumnProps {
  userId: string;
  userName: string;
  staffId: number | string;
  onComplete?: () => void;
  /** Current pack mode selected in the sidebar mode rail. */
  packMode?: PackMode;
  /**
   * Recent-activity rail rendered below the scan band (the sidebar's
   * `PackRecentPacksRail`). When set, the rail — not a compact card — is this
   * station's activity surface: the active order shows as the rail's selected
   * row and its detail lives in the workbench right pane. Matches the Unbox /
   * Testing / Shipping sidebar anatomy.
   */
  railSlot: ReactNode;
  /**
   * Pinned band below the rail's scroll port — the rail's client-side filter
   * (`TechRailSearchBar`), below the rail's scroll port.
   */
  railFooter?: ReactNode;
}

export default function PackScanColumn({
  userId,
  userName,
  staffId,
  onComplete,
  packMode = 'standard',
  railSlot,
  railFooter,
}: PackScanColumnProps) {
  // Global-assistant context: station Q&A skill fragment (plan §-2.2).
  useAssistantContext({ page: 'packing-station', station: 'PACKING', skill: STATION_SKILL });
  const cardPresence = useMotionPresence(framerPresence.stationCard);
  const cardTransition = useMotionTransition(framerTransition.stationCardMount);
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

  // The pack checklist + policy fetches that used to sit here fed the sidebar's
  // own `OrderPackChecklist`, which was dead under `railSlot` and is now gone.
  // `PackOrderPanel` runs the same `useOrderPackChecklist` read in the
  // workspace, so this column was paying for a second copy of it per scan.

  // Mutual exclusion between the order and FBA panes is owned by
  // `usePackerOrderPane` (one dispatch clears the other), so this effect only
  // has to publish its own entity — it no longer needs to know an FBA scan
  // exists. Two places deciding "which entity wins" is how they disagree.
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

  const { theme: themeColor, inputTheme: activeColor } = useStationTheme({ staffId });
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
  const handleSubmit = async (eventOrRaw?: React.FormEvent | string) => {
    if (eventOrRaw && typeof eventOrRaw !== 'string') eventOrRaw.preventDefault();
    const scan =
      typeof eventOrRaw === 'string' ? eventOrRaw.trim() : inputValue.trim();
    if (!scan || isLoading) return;

    // §1b dual-link: a unit QR scanned while an ORDERS/SKU pack is still active
    // links its phone photos to that pack's packer_log (not a fresh prepack); a
    // first-scan / prepack-only unit stays unlinked (null). Read before the
    // reset below — the closure still holds the prior scan's active order.
    const priorPackerLogId =
      activeOrder &&
      (activeOrder.scanType === 'ORDERS' || activeOrder.scanType === 'SKU') &&
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
      // ── Prepack unit QR — attach packing photos to the prepacked unit ────
      const unitKey = scannedUnitKey(scan);
      if (unitKey) {
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
          condition: String(unit.condition_grade || 'N/A').trim() || 'N/A',
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
        return;
      }

      // ── FBA path: FNSKU detected ───────────────────────────────────────────
      if (looksLikeFnsku(scan)) {
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
        // SKU (has `:`) and special commands (clean/FBA-) pass through raw.
        const isTrackingInput = !scan.includes(':') && !/^(clean|fba-)/i.test(scan);

        // FBA combined-shipment ship-on-scan: a UPS tracking number OR an FBA
        // shipment ID resolves to the same combined (LABEL_ASSIGNED) shipment
        // and marks the whole package SHIPPED. A 404 means it isn't an FBA
        // shipment, so fall through to the regular orders packing flow.
        if (isTrackingInput) {
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
        const idempotencyKey = safeRandomUUID();
        const res = await fetch('/api/packing-logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            trackingNumber: normalizedScan,
            photos: [],
            packerId: String(userId),
            packerName: userName,
            createdAt: formatPSTTimestamp(),
            idempotencyKey,
          }),
        });
        const data = await res.json();
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
        } else if (resolvedScanType === 'ORDERS' || resolvedScanType === 'SKU') {
          // SKU scans (e.g. '1071-B:A12') resolve productTitle via the Ecwid
          // platform mapping in /api/packing-logs, so render the same active
          // card the order path uses — but show the SKU in place of TRK#.
          const isSku = resolvedScanType === 'SKU';
          const skuValue = String(data?.sku || '').trim();
          const orderRowIdRaw = Number(data?.orderRowId);
          const packerLogIdRaw = Number(data?.packerLogId ?? data?.packerRecord?.id);
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
            condition: String(data?.condition || '').trim() || 'N/A',
            tracking: String(data?.shippingTrackingNumber || scan).trim(),
            scanType: isSku ? 'SKU' : 'ORDERS',
            sku: skuValue || undefined,
            packerLogId:
              Number.isFinite(packerLogIdRaw) && packerLogIdRaw > 0 ? packerLogIdRaw : null,
            isUnknownOrder,
          });

          // JIT pack Phase 1 — PoPC after ORDERS pack (not SKU-only / unknown).
          // Status + Reprint render in PackOrderPanel (middle), not this column.
          if (
            !isSku &&
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
        if (data.packerRecord?.id) {
          window.dispatchEvent(new CustomEvent('packer-log-added', { detail: data.packerRecord }));
        }
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
            placeholder="Tracking · QR · SKU · Prep"
            icon={<Barcode className="h-[17px] w-[17px]" />}
            iconClassName={activeColor.text}
            // Align icon/text to SIDEBAR_SCAN_DOCK_LEADING_ROW (Unbox/Testing SoT) — not MasterNav deep inset.
            leadingColumn="rail"
            autoFocus
            isResolving={isLoading}
            className="w-full"
          />
        </ScanBandShell>

        {/* Pack mode — the `?packMode=` child page, spelled out. This is a
            MODE label, not an entity identity, so it belongs in the scan column
            (it says how to pack whatever arrives next, and it is true before
            anything is scanned). It rendered only under `!embedded` until
            2026-08-02, which meant never: the sole caller always embeds, so the
            one visible effect of picking Fragile / Multi-Item was dead code. */}
        {packMode !== 'standard' ? (
          <div className="border-b border-border-hairline bg-amber-50 px-3 py-2">
            <p className="rounded-none text-role-caption font-semibold text-amber-800">
              {PACK_MODE_LABELS[packMode]}
            </p>
          </div>
        ) : null}

        {/* Phone photo-request STATUS panels used to live here. The request is
            still published to the operator's phone on a unit scan (and the
            toast confirms it) — only the sidebar readout is gone, so the column
            is scan band → transient feedback → rail. */}

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

          {/* The FBA scan card and the active-order card BOTH left this column
              on 2026-08-02. Pack papers / Reprint left on 2026-08-04 — they
              live under PackOrderPanel identity so a pointer control never
              sits in the focus-locked scan column.

              A Station renders its active entity in exactly ONE region — the
              middle — and this is the scan column (`display/station.md`;
              Unbox is the control). What stays here is TRANSIENT SCAN
              FEEDBACK only: the error banner above. It answers "did the scan
              I just fired work?" — which is the scan bar's own question. */}
        </div>

        {/* Recent-activity rail — the single scroll port of this column. Its
            bottom-anchored filter band rides in `railFooter` (below the scroll
            port, same anatomy as the Testing / Shipping sidebars). */}
        <SidebarRailScrollport>{railSlot}</SidebarRailScrollport>
        {railFooter}
      </div>
    </div>
  );
}
