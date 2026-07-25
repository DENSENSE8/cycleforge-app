'use client';

/**
 * Arrival / triage Package Pairing hub.
 *
 * Sibling of Unbox {@link LineMatchingSection}: same link/unlink + tab bodies,
 * but **no Inventory Item** tab (product is not visible yet at the door) and
 * never autofocuses search fields (station scan bar stays hot after unfound scans).
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { TRIAGE_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { requestConfirm } from '@/design-system/components/confirm';
import {
  ChevronRight,
  Link2,
  Loader2,
  Mail,
  ShoppingCart,
  Ticket,
  Unlink,
} from '@/components/Icons';
import {
  dispatchLineUpdated,
  dispatchSelectLine,
} from '@/components/station/receiving-lines-table-helpers';
import { invalidateReceivingFeeds, patchReceivingRailTicketByCarton } from '@/lib/queries/receiving-queries';
import { invalidateSupportContextCaches } from '@/hooks';
import { WorkspaceCard } from '@/design-system/components';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/design-system/primitives';
import {
  HorizontalButtonSlider,
  type HorizontalSliderItem,
} from '@/components/ui/HorizontalButtonSlider';
import { EcwidProductSearchInline } from '@/components/receiving/unfound/EcwidProductSearchInline';
import { EmailPoLinkTab } from '@/components/receiving/workspace/line-edit/EmailPoLinkTab';
import { PoLinkTab } from '@/components/receiving/workspace/line-edit/PoLinkTab';
import { ZendeskMatchTab } from '@/components/receiving/workspace/line-edit/LineMatchingSection';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { toTriagePackage } from '@/components/receiving/triage/triage-types';
import { useTriagePanel } from '@/components/receiving/triage/useTriagePanel';
import { usePoSuggestions } from '@/components/receiving/triage/usePoSuggestions';
import { PoSuggestBanner } from '@/components/receiving/triage/PoSuggestBanner';
import { useUnmatchedItems } from '@/components/receiving/workspace/unmatched-items/useUnmatchedItems';
import { useReceivingCartonUnlink } from '@/components/receiving/workspace/unmatched-items/useReceivingCartonUnlink';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';

type ArrivalMatchTab = 'zoho_po' | 'ecwid' | 'email' | 'zendesk';

function PackagePairingHeader({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle?: () => void;
}) {
  if (onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className={cn(
          'ds-raw-button flex w-full items-center justify-between gap-2 text-left',
          focusRing('control', 'accent'),
        )}
      >
        <h3 className="min-w-0 shrink text-role-caption font-bold uppercase tracking-[0.14em] text-text-soft">
          Package Pairing
        </h3>
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-text-faint transition-transform duration-150',
            !collapsed && 'rotate-90',
          )}
          aria-hidden
        />
      </button>
    );
  }
  return (
    <h3 className="min-w-0 shrink text-role-caption font-bold uppercase tracking-[0.14em] text-text-soft">
      Package Pairing
    </h3>
  );
}

export function TriageLineMatchingSection({
  row,
  staffId,
  showOpenInUnbox = true,
  embedded = false,
  collapsed = false,
  onToggleCollapsed,
  showTopRule = false,
}: {
  row: ReceivingLineRow;
  staffId: string;
  showOpenInUnbox?: boolean;
  embedded?: boolean;
  collapsed?: boolean;
  /** When set, Package Pairing header is a toggle (Arrival overview accordion). */
  onToggleCollapsed?: () => void;
  showTopRule?: boolean;
}) {
  const pkg = toTriagePackage(row);

  if (!pkg.receivingId) {
    const teaching = (
      <p className="rounded-lg border border-dashed border-border-soft bg-surface-canvas px-4 py-5 text-center text-xs text-text-soft">
        This package has no carton record yet — scan its tracking to enable pairing.
      </p>
    );
    if (embedded) {
      return (
        <div className="space-y-2">
          <PackagePairingHeader
            collapsed={collapsed}
            onToggle={onToggleCollapsed}
          />
          {!collapsed ? teaching : null}
        </div>
      );
    }
    return (
      <WorkspaceCard label="Package Pairing" overflow="visible">
        {teaching}
      </WorkspaceCard>
    );
  }

  return (
    <ArrivalMatchingCard
      row={row}
      staffId={staffId}
      receivingId={pkg.receivingId}
      showOpenInUnbox={showOpenInUnbox}
      embedded={embedded}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      showTopRule={showTopRule}
    />
  );
}

function ArrivalMatchingCard({
  row,
  staffId,
  receivingId,
  showOpenInUnbox,
  embedded,
  collapsed,
  onToggleCollapsed,
  showTopRule,
}: {
  row: ReceivingLineRow;
  staffId: string;
  receivingId: number;
  showOpenInUnbox: boolean;
  embedded: boolean;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  showTopRule: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const pkg = toTriagePackage(row);
  // Arrival defaults to Store — Inventory Item is Unbox-only (product not visible yet).
  const [tab, setTab] = useState<ArrivalMatchTab>('ecwid');

  const orderLinked = !pkg.isUnmatched && Boolean(pkg.poNumber || pkg.zohoPoId);
  const hasTicket = Boolean(pkg.zendeskTicket);
  const [forcePicker, setForcePicker] = useState(false);
  const [unlinkingTicket, setUnlinkingTicket] = useState(false);
  const { unlinkCarton, unlinking } = useReceivingCartonUnlink();
  const pickerCollapsed = orderLinked && !forcePicker;
  const zendeskQueriesActive = !collapsed && !pickerCollapsed && tab === 'zendesk';
  const t = useTriagePanel({
    row,
    loadCandidates: zendeskQueriesActive,
    loadDeliveredEmails: zendeskQueriesActive,
  });
  const poSuggestions = usePoSuggestions(row, !collapsed && !pickerCollapsed);
  const pairingCollapse = useMotionPresence(framerPresence.collapseHeight);
  const pairingCollapseTransition = useMotionTransition(framerTransition.sidebarExpand);

  const unlink = async () => {
    const ok = await unlinkCarton({
      receivingId,
      lineId: row.id,
      confirmMessage:
        pkg.isUnmatched || isReturnIntake(row)
          ? 'Unlink this package? The order pairing is cleared and the carton goes back to the Unfound queue.'
          : 'Unlink this package? The PO#/platform pairing is cleared and the carton goes back to the Unfound queue.',
      onSuccess: () => {
        setForcePicker(false);
        if (showOpenInUnbox) {
          const params = new URLSearchParams(searchParams.toString());
          params.delete('mode');
          params.set('triview', 'unfound');
          router.replace(`${TRIAGE_SURFACE_ROUTE}?${params.toString()}`);
        }
      },
    });
    if (ok) setForcePicker(false);
  };

  const unlinkTicket = async () => {
    if (unlinkingTicket) return;
    const ticketId = (pkg.zendeskTicket?.match(/(\d+)/) ?? [])[1];
    if (!ticketId) {
      toast.error('Could not resolve the ticket number');
      return;
    }
    const ok = await requestConfirm({
      description: `Unlink ticket #${ticketId} from this package?`,
      tone: 'danger',
      confirmLabel: 'Unlink',
    });
    if (!ok) return;
    setUnlinkingTicket(true);
    try {
      const sp = new URLSearchParams({ receivingId: String(receivingId), ticketId });
      const res = await fetch(`/api/receiving/zendesk-claim/link?${sp.toString()}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        toast.error(data?.error ?? `Ticket unlink failed (${res.status})`);
        return;
      }
      dispatchLineUpdated({ id: row.id, zendesk_ticket: null });
      await queryClient.invalidateQueries({
        queryKey: ['triage-ticket-candidates', receivingId],
      });
      patchReceivingRailTicketByCarton(queryClient, receivingId, null);
      invalidateSupportContextCaches(queryClient);
      invalidateReceivingFeeds(queryClient);
      toast.success('Ticket unlinked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ticket unlink failed');
    } finally {
      setUnlinkingTicket(false);
    }
  };

  const cardTopRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const open = () => {
      setTab('ecwid');
      setForcePicker(true);
      requestAnimationFrame(() =>
        cardTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      );
    };
    window.addEventListener('receiving-open-pairing-add', open);
    return () => window.removeEventListener('receiving-open-pairing-add', open);
  }, []);

  useEffect(() => {
    setForcePicker(false);
  }, [pkg.poNumber, pkg.zohoPoId]);

  const u = useUnmatchedItems({
    receivingId,
    staffId,
    sourcePlatformHint: pkg.sourcePlatform ?? undefined,
    receivingTypeHint: (pkg.intakeType?.toUpperCase() as 'PO' | 'RETURN' | 'TRADE_IN') ?? 'PO',
    listingUrlHint: row.receiving_listing_url ?? undefined,
    onLinked: ({ carton, line }) => {
      const cartonPatch = {
        zoho_purchaseorder_number: carton.zoho_purchaseorder_number,
        receiving_source: carton.source ?? 'unmatched',
        source_platform: carton.source_platform ?? null,
        source_platform_pill: carton.source_platform ?? null,
      };
      if (line && line.id > 0 && row.id < 0) {
        const realRow: ReceivingLineRow = {
          ...row,
          ...cartonPatch,
          id: line.id,
          sku: line.sku ?? row.sku,
          item_name: line.item_name ?? row.item_name,
          quantity_expected: line.quantity_expected,
          quantity_received: line.quantity_received,
          condition_grade: line.condition_grade ?? row.condition_grade,
          receiving_listing_url: line.listing_url ?? row.receiving_listing_url,
          source_platform_pill: line.source_platform_pill ?? cartonPatch.source_platform_pill,
        };
        dispatchSelectLine(realRow);
      } else {
        dispatchLineUpdated({ id: row.id, ...cartonPatch });
      }
      invalidateReceivingFeeds(queryClient);
      setForcePicker(false);
      if (showOpenInUnbox) {
        setTimeout(() => window.dispatchEvent(new CustomEvent('receiving-focus-scan')), 60);
      }
    },
  });

  const tabs: HorizontalSliderItem[] = [
    { id: 'zoho_po', label: 'PO', icon: Link2 },
    { id: 'ecwid', label: 'Store', icon: ShoppingCart },
    { id: 'zendesk', label: 'Tickets', icon: Ticket },
    { id: 'email', label: 'Email PO', icon: Mail },
  ];

  // Open-in-unbox lives on TriagePanel SectionTabsSlider rightSlot — not here.
  const body = (
    // min-w-0 + overflow-x-clip: Store/Tickets lists must not widen the card
    // (long order titles / refs were stretching the pairing shell on tab switch).
    <div className="min-w-0 w-full max-w-full overflow-x-clip">
      <PoSuggestBanner suggestions={poSuggestions} />

      <div ref={cardTopRef} className="mb-3 min-w-0">
        <HorizontalButtonSlider
          variant="nav"
          dense
          overlay
          className="min-w-0 w-full"
          items={tabs}
          value={tab}
          onChange={(id) => setTab(id as ArrivalMatchTab)}
          aria-label="Pairing tabs"
        />
      </div>
      {tab === 'zendesk' && t.hiddenLinked > 0 ? (
        <HoverTooltip label={`${t.hiddenLinked} ticket(s) already linked elsewhere are hidden`}>
          <p className="mb-2 text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
            {t.hiddenLinked} hidden
          </p>
        </HoverTooltip>
      ) : null}

      <div className="min-w-0 w-full max-w-full overflow-x-clip">
        {tab === 'ecwid' ? (
          <EcwidProductSearchInline
            receivingId={receivingId}
            popoverMode="repair_service"
            initialOrderScope="all"
            autoFocusSearch={false}
            className="min-w-0 w-full max-w-full"
            onSelect={u.handleAddLine}
            onClose={() => setTab('zoho_po')}
          />
        ) : tab === 'zoho_po' ? (
          <PoLinkTab row={row} receivingId={receivingId} />
        ) : tab === 'email' ? (
          <EmailPoLinkTab row={row} receivingId={receivingId} />
        ) : (
          <ZendeskMatchTab t={t} />
        )}
      </div>
    </div>
  );

  const ticketLinkRow = hasTicket ? (
    <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
        <Ticket className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-role-eyebrow uppercase tracking-widest text-violet-700">
          Claim ticket
        </span>
        <p className="truncate text-role-caption font-bold font-mono text-text-default">
          {pkg.zendeskTicket}
        </p>
      </div>
      <HoverTooltip label="Unlink this claim ticket (leaves the order pairing intact)" asChild focusable={false}>
        <Button
          variant="secondary"
          size="sm"
          icon={unlinkingTicket ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink />}
          onClick={unlinkTicket}
          disabled={unlinkingTicket}
          className="h-7 shrink-0 border-rose-200 bg-rose-50 px-2.5 text-rose-700 hover:bg-rose-100"
        >
          {unlinkingTicket ? 'Unlinking…' : 'Unlink'}
        </Button>
      </HoverTooltip>
    </div>
  ) : null;

  const content = (
    <div className="min-w-0 space-y-2 overflow-x-clip">
      {ticketLinkRow}
      {pickerCollapsed ? (
        <div className="flex items-center gap-2">
          <HoverTooltip label="Re-open the picker to change or add a pairing" asChild focusable={false}>
            <Button
              variant="ghost"
              size="sm"
              icon={<Link2 />}
              onClick={() => setForcePicker(true)}
              className="h-7 px-2.5 text-text-muted"
            >
              Change / add pairing
            </Button>
          </HoverTooltip>
          <HoverTooltip label="Unlink this order/PO — sends the carton back to Unfound" asChild focusable={false}>
            <Button
              variant="secondary"
              size="sm"
              icon={unlinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink />}
              onClick={unlink}
              disabled={unlinking}
              className="h-7 border-rose-200 bg-rose-50 px-2.5 text-rose-700 hover:bg-rose-100"
            >
              {unlinking ? 'Unlinking…' : 'Unlink'}
            </Button>
          </HoverTooltip>
        </div>
      ) : (
        body
      )}
    </div>
  );

  if (embedded) {
    // Header always visible (collapsed accordion). Body height-animates so
    // Location Placement below stays reachable without a full hide.
    return (
      <div className={showTopRule ? 'border-t border-border-hairline pt-4' : undefined}>
        <div className="mb-1">
          <PackagePairingHeader collapsed={collapsed} onToggle={onToggleCollapsed} />
        </div>
        <motion.div
          initial={false}
          animate={
            collapsed
              ? { ...pairingCollapse.exit }
              : { ...pairingCollapse.animate }
          }
          transition={pairingCollapseTransition}
          className={collapsed ? 'overflow-hidden' : 'overflow-visible'}
          aria-hidden={collapsed}
        >
          <div className={collapsed ? undefined : 'mt-2'}>{content}</div>
        </motion.div>
      </div>
    );
  }

  return (
    <WorkspaceCard label="Package Pairing" overflow="visible">
      {content}
    </WorkspaceCard>
  );
}
