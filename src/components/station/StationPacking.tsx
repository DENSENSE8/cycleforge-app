'use client';

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { Barcode, AlertCircle, Package } from '../Icons';
import { getLast4 } from '../ui/CopyChip';
import { useStationTheme } from '@/hooks/useStationTheme';
import { useLast8TrackingSearch } from '@/hooks/useLast8TrackingSearch';
import { formatPSTTimestamp } from '@/utils/date';
import StationGoalBar from './StationGoalBar';
import { ThemedStationScanBar } from '@/components/station/scan-bar';
import { ScanBandShell } from '@/components/station/scan-bar';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { looksLikeFnsku } from '@/lib/scan-resolver';
import { scannedUnitKey } from '@/lib/barcode-routing';
import { OrderPackChecklist } from '@/components/packing/OrderPackChecklist';
import { usePackingPolicy } from '@/hooks/usePackingPolicy';
import { useOrderPackChecklist } from '@/hooks/useOrderPackChecklist';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { PackZendeskSection } from './PackZendeskSection';
import { SupportContextHub } from '@/components/support/context';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import { STATION_SKILL } from '@/lib/assistant/page-skills';
import { dispatchPackActiveOrder } from '@/components/packer/usePackerOrderPane';
import { PackActiveIdentityChips } from '@/components/packer/PackActiveIdentityChips';
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

interface ActiveFbaScan {
  fnsku: string;
  productTitle: string;
  shipmentRef: string | null;
  plannedQty: number;
  combinedPackScannedQty: number;
  isNew: boolean; // true if no existing fba_shipment_items row was found (added on-the-fly)
}

type PackMode = 'standard' | 'fragile' | 'multi';

const PACK_MODE_LABELS: Record<PackMode, string> = {
  standard: 'Standard',
  fragile: 'Fragile — extra bubble wrap, double-box if needed',
  multi: 'Multi-Item — verify ALL items before sealing',
};

interface StationPackingProps {
  userId: string;
  userName: string;
  staffId: number | string;
  /** Goal-bar count — standalone station page only (the sidebar has no goal bar). */
  todayCount?: number;
  goal?: number;
  onComplete?: () => void;
  embedded?: boolean;
  /** Current pack mode selected in the sidebar mode rail. */
  packMode?: PackMode;
  /**
   * Recent-activity rail rendered below the scan band (the sidebar's
   * `PackRecentPacksRail`). When set, the rail — not a compact card — is this
   * station's activity surface: the active order shows as the rail's selected
   * row and its detail lives in the workbench right pane. Matches the Unbox /
   * Testing / Shipping sidebar anatomy.
   */
  railSlot?: ReactNode;
  /**
   * Pinned band below the rail's scroll port — the rail's client-side filter
   * (`TechRailSearchBar`). Rendered only alongside `railSlot`.
   */
  railFooter?: ReactNode;
}

export default function StationPacking({
  userId,
  userName,
  staffId,
  todayCount = 0,
  goal = 50,
  onComplete,
  embedded = false,
  packMode = 'standard',
  railSlot,
  railFooter,
}: StationPackingProps) {
  // Global-assistant context: station Q&A skill fragment (plan §-2.2).
  useAssistantContext({ page: 'packing-station', station: 'PACKING', skill: STATION_SKILL });
  const cardPresence = useMotionPresence(framerPresence.stationCard);
  const cardTransition = useMotionTransition(framerTransition.stationCardMount);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActivePackingOrder | null>(null);
  const [activeFba, setActiveFba] = useState<ActiveFbaScan | null>(null);
  const { data: packingPolicy } = usePackingPolicy();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: packChecklist, isLoading: checklistLoading } = useOrderPackChecklist({
    orderRowId: activeOrder?.orderRowId ?? null,
    sku: activeOrder?.sku,
    condition: activeOrder?.condition,
    productTitle: activeOrder?.productTitle,
    enabled: Boolean(activeOrder),
  });

  useEffect(() => {
    if (!activeOrder || activeFba) {
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
  }, [activeOrder, activeFba]);

  const { theme: themeColor, colors: themeColors, inputTheme: activeColor } = useStationTheme({ staffId });
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
  const handleSubmit = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    const scan = inputValue.trim();
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
    setActiveFba(null);

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
          setActiveFba({
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
            setActiveFba({
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
          setActiveFba({
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

  return (
    <div className={`flex flex-col h-full bg-surface-card overflow-hidden ${embedded ? '' : 'border-r border-border-hairline'}`}>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Welcome / goal — standalone station page only. */}
        {!embedded ? (
          <div className={`${SIDEBAR_GUTTER} space-y-4 pt-4`}>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-semibold text-text-default tracking-tighter">Welcome, {userName}</h2>
                <div className="flex items-center gap-2">
                  <StaffFilterButton allLabel="My packs" align="end" />
                  <div className={`p-3 ${themeColors.bg} text-white rounded-2xl shadow-lg ${themeColors.shadow}`}>
                    <Package className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>

            <StationGoalBar
              count={todayCount}
              goal={goal}
              label="PACKED"
              theme={themeColor}
            />

            {packMode !== 'standard' ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-role-caption font-semibold text-amber-800">
                {PACK_MODE_LABELS[packMode]}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Flush 40px scan band — same ScanBandShell + rail leading column as Unbox / Testing / Shipping. */}
        <ScanBandShell themeColor={themeColor}>
          <ThemedStationScanBar
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            inputRef={inputRef}
            staffId={staffId}
            placeholder="Tracking, unit QR, FNSKU, FBA, SKU"
            icon={<Barcode className="h-[17px] w-[17px]" />}
            iconClassName={activeColor.text}
            // Align icon/text to SIDEBAR_SCAN_DOCK_LEADING_ROW (Unbox/Testing SoT) — not MasterNav deep inset.
            leadingColumn="rail"
            autoFocus
            isResolving={isLoading}
            className="w-full"
          />
        </ScanBandShell>

        {/* Phone photo-request STATUS panels used to live here. The request is
            still published to the operator's phone on a unit scan (and the
            toast confirms it) — only the sidebar readout is gone, so the column
            is scan band → transient feedback → rail. */}
        {!embedded ? (
          <div className={SIDEBAR_GUTTER}>
            <p className="px-1 text-role-micro text-text-faint">
              Supports tracking, unit QR, FNSKU/ASIN (10 chars: <code className="font-mono">X00</code> or <code className="font-mono">B0</code> prefix), FBA, and{' '}
              <code className="font-mono">SKU:VALUE</code> scans.
            </p>
          </div>
        ) : null}

        {/* Transient scan feedback. With a rail below it this band is
            content-height (`shrink-0`) and the rail owns the scroll port —
            one scrolling region per column, same as the Unbox sidebar. */}
        <div
          className={`${railSlot ? 'shrink-0' : 'flex-1 overflow-y-auto no-scrollbar pb-6'} ${SIDEBAR_GUTTER} space-y-3`}
        >
          <AnimatePresence mode="wait">
            {errorMessage && (
              <motion.div
                {...cardPresence}
                transition={cardTransition}
                className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-200 flex items-center gap-3"
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-xs font-semibold">{errorMessage}</p>
              </motion.div>
            )}

          </AnimatePresence>

          {/* FBA scan result card */}
          <AnimatePresence mode="wait">
            {activeFba && (
              <motion.div
                key={activeFba.fnsku}
                {...cardPresence}
                transition={cardTransition}
                className="p-4 bg-surface-card rounded-2xl border border-purple-200 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-role-micro text-purple-500 uppercase tracking-widest">FBA Scan</p>
                    {activeFba.isNew && (
                      <span className="text-role-eyebrow bg-blue-100 text-blue-700 border border-blue-200 rounded-lg px-1.5 py-0.5 uppercase tracking-wider">
                        Added to Today
                      </span>
                    )}
                  </div>
                  {activeFba.shipmentRef && (
                    <span className="text-role-micro font-mono text-purple-700">{activeFba.shipmentRef}</span>
                  )}
                </div>
                <h3 className="text-base font-semibold text-text-default leading-tight">{activeFba.productTitle}</h3>
                <div className="mt-3 flex items-stretch justify-between gap-3 rounded-xl border border-purple-100 bg-purple-50/40 px-3 py-2.5">
                  <HoverTooltip label={activeFba.fnsku} asChild>
                    <div className="min-w-0 flex-1">
                      <p className="text-role-micro text-purple-400 uppercase tracking-wider">FNSKU</p>
                      <p className="text-sm font-mono font-semibold text-text-default tabular-nums">{getLast4(activeFba.fnsku)}</p>
                    </div>
                  </HoverTooltip>
                  <div className="flex-1 text-center border-x border-purple-100/80 px-2">
                    <p className="text-role-micro text-text-faint uppercase tracking-wider">Planned</p>
                    <p className="text-sm font-semibold text-text-default tabular-nums">
                      {activeFba.plannedQty > 0 ? activeFba.plannedQty : '—'}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1 text-right">
                    <p className="text-role-micro text-text-faint uppercase tracking-wider">Scanned</p>
                    <p className="text-sm font-semibold text-text-default tabular-nums">
                      {activeFba.combinedPackScannedQty}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Active-order card — the standalone station page's own activity
              surface. With a `railSlot` the rail is that surface instead: the
              active order is its selected row and the checklist lives in the
              workbench right pane, so this card would be a second, redundant
              shape for the same job. */}
          <AnimatePresence mode="wait">
            {activeOrder && !activeFba && !railSlot && (
              <motion.div
                key={activeOrder.tracking || activeOrder.orderId}
                {...cardPresence}
                transition={cardTransition}
                className="rounded-2xl border border-border-soft bg-surface-card px-3 py-2.5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="shrink-0 text-role-eyebrow uppercase tracking-widest text-text-soft">
                    {activeOrder.scanType === 'UNIT'
                      ? 'Active unit'
                      : activeOrder.scanType === 'SKU'
                        ? 'Active SKU'
                        : 'Active order'}
                  </p>
                  <PackActiveIdentityChips activeOrder={activeOrder} />
                </div>
                <p className="mt-1 truncate text-role-caption font-semibold text-text-default">
                  {activeOrder.productTitle}
                </p>
                {embedded ? (
                  <p className="mt-2 text-role-caption font-semibold text-emerald-700">
                    Checklist open in the workbench — verify before sealing.
                  </p>
                ) : (
                  <>
                    <OrderPackChecklist
                      lines={packChecklist?.lines ?? []}
                      enforcement={
                        packingPolicy?.enforcement ?? packChecklist?.enforcement ?? 'advisory'
                      }
                      resetKey={
                        activeOrder.orderRowId
                          ? `row-${activeOrder.orderRowId}`
                          : activeOrder.sku || activeOrder.tracking
                      }
                      isLoading={checklistLoading}
                      variant="station"
                      className="mt-3"
                      isUnknownOrder={Boolean(activeOrder.isUnknownOrder)}
                      unknownCondition={activeOrder.condition}
                    />
                    <div className="mt-3 border-t border-border-hairline pt-3">
                      <SupportContextHub
                        anchor={{
                          order: activeOrder.orderId || undefined,
                          tracking: activeOrder.tracking || undefined,
                        }}
                        variant="rollup"
                        defaultSegment="customer"
                        defaultExpanded={false}
                      />
                    </div>
                    <PackZendeskSection
                      orderId={activeOrder.orderId}
                      tracking={activeOrder.tracking}
                      orderRowId={activeOrder.orderRowId}
                      className="mt-3"
                    />
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Recent-activity rail — the single scroll port of this column. Its
            bottom-anchored filter band rides in `railFooter` (below the scroll
            port, same anatomy as the Testing / Shipping sidebars). */}
        {railSlot ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{railSlot}</div>
        ) : null}
        {railSlot ? railFooter : null}
      </div>
    </div>
  );
}
