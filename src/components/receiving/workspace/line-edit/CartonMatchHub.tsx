'use client';

/**
 * CartonMatchHub — unified Package Pairing + Auto-match surface for Unbox,
 * Testing, and Arrival.
 *
 * One host, two presentations:
 *   • Auto-match — `UnfoundMatchStrip` action grid when `autoMatch` is set
 *     (unfound only). Resolution toolkit: Return # / Zoho / Amazon / Find ticket.
 *   • Pairing — avenue switcher + SearchBar attach bodies (Inventory · PO ·
 *     Store · Tickets). Never merges Auto-match into the avenue control.
 *
 * One hub adapts via:
 *   • `tabSet` — `unbox` includes Inventory Item; `arrival` does not
 *   • `chrome` — `bare` (Station Displays push — Arrival · Unbox · Testing): no
 *     duplicate title / pencil; Pairing secondary-token dropdown; flush plane
 *     (no WorkspaceCard island). `card`: WorkspaceCard + dense slider. Both
 *     mount the Auto-match strip above Pairing when unfound.
 *   • `autoFocusSearch` — Unbox desk may focus; Arrival Station never
 *
 * Multi-link: order/PO collapses the picker; tickets stay on ReceivingTicketChip.
 * Store search always uses `chrome="bare"` on the flush Displays plane (D5).
 */

import { useEffect, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from '@/design-system/motion';
import { openInUnboxHref, TRIAGE_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Link2,
  Loader2,
  Mail,
  PackageOpen,
  Pencil,
  Search,
  ShoppingCart,
  Ticket,
  Unlink,
} from '@/components/Icons';
import {
  dispatchLineUpdated,
  dispatchSelectLine,
} from '@/components/station/receiving-lines-table-helpers';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { WorkspaceCard } from '@/design-system/components';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/** Flush Displays body — sits in the push column `px-4`; no card radius / inset. */
const PAIRING_FLUSH_HOST_CLASS = cn('min-h-0', cornerClass('flush'));
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { SearchBar } from '@/components/ui/SearchBar';
import { Button, IconButton } from '@/design-system/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { OrderIdChip, getLast8 } from '@/components/ui/CopyChip';
import {
  HorizontalButtonSlider,
  type HorizontalSliderItem,
} from '@/components/ui/HorizontalButtonSlider';
import { EcwidProductSearchInline } from '@/components/receiving/unfound/EcwidProductSearchInline';
import { ZohoItemPairTab } from '@/components/receiving/workspace/line-edit/ZohoItemPairTab';
import { PoLinkTab } from '@/components/receiving/workspace/line-edit/PoLinkTab';
import { UnfoundMatchStrip } from '@/components/receiving/workspace/line-edit/UnfoundMatchStrip';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { MatchCard } from '@/components/receiving/triage/MatchCard';
import { relativeTime, toTriagePackage } from '@/components/receiving/triage/triage-types';
import { useTriagePanel } from '@/components/receiving/triage/useTriagePanel';
import { useUnmatchedItems } from '@/components/receiving/workspace/unmatched-items/useUnmatchedItems';
import { useReceivingCartonUnlink } from '@/components/receiving/workspace/unmatched-items/useReceivingCartonUnlink';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { WorkspaceSectionTitle } from '../WorkspaceSectionLabel';
import { RECEIVING_OPEN_PAIRING_PO_EVENT } from '@/utils/events';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

// These were exported for `TriageLineMatchingSection`'s `Omit<CartonMatchHubProps, …>`;
// that centre wrapper is deleted (Arrival Package Pairing is now the Linkage
// Displays body), so they are internal to this component again.
type CartonMatchTabSet = 'unbox' | 'arrival';
/** Pairing avenues — Inventory Item is Unbox-only. */
type MatchTab = 'zoho_item' | 'zoho_po' | 'ecwid' | 'zendesk';

type CartonMatchHubChrome = 'card' | 'bare';

type CartonMatchAutoMatch = {
  receivingId: number | null;
  lineId?: number | null;
  trackingNumber: string | null;
  receivedSerial?: string | null;
  providerTicketId?: number | null;
  ticketNumber?: string | null;
  ticketUrl?: string | null;
  onTicketChanged?: () => void;
};

type CartonMatchHubProps = {
  row: ReceivingLineRow;
  staffId: string;
  /** `unbox` = Inventory Item + PO + Store + Tickets; `arrival` omits Inventory. */
  tabSet?: CartonMatchTabSet;
  /**
   * `bare` — Unbox Displays host: no duplicate "Package Pairing" title, no
   * pencil, Pairing-only secondary-token dropdown (+ Auto-match strip when
   * unfound). `card` — Arrival / Triage chrome.
   */
  chrome?: CartonMatchHubChrome;
  /** Arrival Station: false. Unbox desk: typically true. */
  autoFocusSearch?: boolean;
  /**
   * Open on this tab — the host's "…and land on PO" intent, carried as data.
   *
   * The Unbox `# ----` chip used to say this with a window event dispatched a
   * frame after it opened the pairing display. That never worked: the display
   * opens through `router.replace`, so this hub mounts a navigation later and
   * the event fired into an empty room. A prop is read at mount, so there is no
   * window to miss.
   */
  focusTab?: MatchTab | null;
  /** Monotonic bump so the same tab can be re-selected while already mounted. */
  focusRequestId?: number;
  /** Hide the "Open in unbox" jump when already in unbox. */
  showOpenInUnbox?: boolean;
  embedded?: boolean;
  collapsed?: boolean;
  /** Arrival accordion header toggle. */
  onToggleCollapsed?: () => void;
  showTopRule?: boolean;
  /** When set and carton is unfound, Quick-match (Auto-match) lives inside this hub. */
  autoMatch?: CartonMatchAutoMatch | null;
};

function MatchHubHeader({
  collapsed,
  onToggle,
  actions,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  actions?: ReactNode;
}) {
  if (onToggle) {
    return (
      <div className="flex min-w-0 items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className={cn(
            'ds-raw-button flex min-w-0 flex-1 items-center justify-between gap-2 text-left',
            focusRing('control', 'accent'),
          )}
        >
          <h3 className="min-w-0 shrink text-role-caption font-semibold uppercase tracking-[0.14em] text-text-soft">
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
        {actions}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 overflow-visible">
      <WorkspaceSectionTitle as="h3" className="min-w-0 shrink">
        Package Pairing
      </WorkspaceSectionTitle>
      {actions}
    </div>
  );
}

export function CartonMatchHub({
  row,
  staffId,
  tabSet = 'unbox',
  chrome = 'card',
  autoFocusSearch,
  focusTab = null,
  focusRequestId = 0,
  showOpenInUnbox = true,
  embedded = false,
  collapsed = false,
  onToggleCollapsed,
  showTopRule = false,
  autoMatch = null,
}: CartonMatchHubProps) {
  const pkg = toTriagePackage(row);
  const focusSearch =
    autoFocusSearch ?? (tabSet === 'unbox' && !showOpenInUnbox);
  const bareChrome = chrome === 'bare';

  if (!pkg.receivingId) {
    const teaching = (
      <p
        className={cn(
          cornerClass('flush'),
          'border border-dashed border-border-soft bg-surface-canvas px-4 py-5 text-center text-xs text-text-soft',
        )}
      >
        This package has no carton record yet — scan its tracking to enable pairing.
      </p>
    );
    if (embedded) {
      return (
        <div className="space-y-2">
          <MatchHubHeader collapsed={collapsed} onToggle={onToggleCollapsed} />
          {!collapsed ? teaching : null}
        </div>
      );
    }
    if (bareChrome) {
      return <div className={PAIRING_FLUSH_HOST_CLASS}>{teaching}</div>;
    }
    return (
      <WorkspaceCard label="Package Pairing" overflow="visible">
        {teaching}
      </WorkspaceCard>
    );
  }

  return (
    <MatchHubCard
      row={row}
      staffId={staffId}
      receivingId={pkg.receivingId}
      tabSet={tabSet}
      chrome={chrome}
      autoFocusSearch={focusSearch}
      showOpenInUnbox={showOpenInUnbox}
      embedded={embedded}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      showTopRule={showTopRule}
      autoMatch={autoMatch}
      focusTab={focusTab}
      focusRequestId={focusRequestId}
    />
  );
}

function MatchHubCard({
  row,
  staffId,
  receivingId,
  tabSet,
  chrome,
  autoFocusSearch,
  showOpenInUnbox,
  embedded,
  collapsed,
  onToggleCollapsed,
  showTopRule,
  autoMatch,
  focusTab,
  focusRequestId,
}: {
  row: ReceivingLineRow;
  staffId: string;
  receivingId: number;
  tabSet: CartonMatchTabSet;
  chrome: CartonMatchHubChrome;
  autoFocusSearch: boolean;
  showOpenInUnbox: boolean;
  embedded: boolean;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  showTopRule: boolean;
  autoMatch: CartonMatchAutoMatch | null;
  focusTab: MatchTab | null;
  focusRequestId: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const pkg = toTriagePackage(row);
  const bareChrome = chrome === 'bare';

  const [tab, setTab] = useState<MatchTab>(() => {
    if (tabSet === 'arrival') return 'ecwid';
    return pkg.isUnmatched ? 'zoho_item' : 'ecwid';
  });

  const orderLinked = !pkg.isUnmatched && Boolean(pkg.poNumber || pkg.zohoPoId);
  const [forcePicker, setForcePicker] = useState(false);
  const { unlinkCarton, unlinking } = useReceivingCartonUnlink();
  const pickerCollapsed = orderLinked && !forcePicker;
  const zendeskQueriesActive =
    !collapsed && !pickerCollapsed && tab === 'zendesk';
  const t = useTriagePanel({
    row,
    loadCandidates: zendeskQueriesActive,
    loadDeliveredEmails: zendeskQueriesActive,
  });
  const pairingCollapse = useMotionPresence(framerPresence.collapseHeight);
  const pairingCollapseTransition = useMotionTransition(framerTransition.sidebarExpand);

  // Auto-match strip when unfound — same presentation on bare and card.
  const showQuickMatchStrip = Boolean(autoMatch) && !pickerCollapsed;

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

  const cardTopRef = useRef<HTMLDivElement>(null);
  const [poFocusRequestId, setPoFocusRequestId] = useState(0);
  const openPairingTab = (next: MatchTab) => {
    setTab(next);
    setForcePicker(true);
    if (next === 'zoho_po') setPoFocusRequestId((n) => n + 1);
    requestAnimationFrame(() =>
      cardTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
  };

  useEffect(() => {
    const openStore = () => openPairingTab('ecwid');
    window.addEventListener('receiving-open-pairing-add', openStore);
    return () => window.removeEventListener('receiving-open-pairing-add', openStore);
  }, []);

  /**
   * Triage's PO pencil — it toggles a local `pairingOpen`, so this hub is
   * mounted in the same commit and a one-frame dispatch does reach us.
   *
   * Unbox cannot use this path: it opens the pairing DISPLAY with a
   * `router.replace`, so the hub mounts a navigation after the click and any
   * dispatch fires into an empty room. That host uses `focusTab` below.
   */
  useEffect(() => {
    const openPo = () => openPairingTab('zoho_po');
    window.addEventListener(RECEIVING_OPEN_PAIRING_PO_EVENT, openPo);
    return () => window.removeEventListener(RECEIVING_OPEN_PAIRING_PO_EVENT, openPo);
  }, []);

  /**
   * The host asked us to land on a specific tab, as DATA rather than as a timed
   * event — read on mount, so there is no window to miss. `focusRequestId`
   * re-fires it when the host asks again while we are already up.
   */
  useEffect(() => {
    if (!focusTab) return;
    openPairingTab(focusTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- request-id handoff
  }, [focusTab, focusRequestId]);

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
        setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
      }
    },
  });

  const openInUnbox = () => {
    router.push(openInUnboxHref(receivingId, row.id));
  };

  const tabs: HorizontalSliderItem[] =
    tabSet === 'arrival'
      ? [
          { id: 'zoho_po', label: 'PO', icon: Link2 },
          { id: 'ecwid', label: 'Store', icon: ShoppingCart },
          { id: 'zendesk', label: 'Tickets', icon: Ticket },
        ]
      : [
          { id: 'zoho_item', label: 'Inventory Item', icon: Search },
          { id: 'zoho_po', label: 'PO', icon: Link2 },
          { id: 'ecwid', label: 'Store', icon: ShoppingCart },
          { id: 'zendesk', label: 'Tickets', icon: Ticket },
        ];

  const pairingModes: { id: MatchTab; label: string; icon: IconComponent }[] = tabs.map(
    (item) => ({
      id: item.id as MatchTab,
      label: item.label,
      icon: (item.icon ?? Search) as IconComponent,
    }),
  );

  const selectAvenue = (id: MatchTab) => {
    setTab(id);
    if (id === 'ecwid') setForcePicker(true);
  };

  const activeModeMeta =
    pairingModes.find((m) => m.id === tab) ?? pairingModes[0];

  const headerActions = (
    <div className="flex shrink-0 items-center gap-1.5">
      {showOpenInUnbox ? (
        <HoverTooltip label="Open this carton in unbox (serials, photos, receive)" asChild focusable={false}>
          <Button
            variant="secondary"
            size="sm"
            icon={<PackageOpen />}
            onClick={openInUnbox}
            className="h-7 border-blue-200 bg-blue-50 px-2.5 text-blue-700 hover:bg-blue-100"
          >
            Open in unbox
          </Button>
        </HoverTooltip>
      ) : null}
      {/* Card hosts only — bare Unbox Displays owns Store via the mode dropdown. */}
      {!embedded && !bareChrome ? (
        <HoverTooltip label="Add items — search recent store orders by order #, title, or SKU" focusable={false}>
          <IconButton
            icon={<Pencil className="h-3.5 w-3.5 text-white" />}
            ariaLabel="Search store orders to add items"
            onClick={() => {
              setTab('ecwid');
              setForcePicker(true);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700"
          />
        </HoverTooltip>
      ) : null}
    </div>
  );

  const quickMatchStrip =
    showQuickMatchStrip && autoMatch ? (
      <UnfoundMatchStrip
        receivingId={autoMatch.receivingId}
        lineId={autoMatch.lineId}
        trackingNumber={autoMatch.trackingNumber}
        receivedSerial={autoMatch.receivedSerial}
        providerTicketId={autoMatch.providerTicketId}
        ticketNumber={autoMatch.ticketNumber}
        ticketUrl={autoMatch.ticketUrl}
        onTicketChanged={autoMatch.onTicketChanged}
        showTopRule={false}
        layout="grid"
      />
    ) : null;

  const ActiveIcon = activeModeMeta.icon;

  const avenueSwitcher = bareChrome ? (
    <div ref={cardTopRef} className="mb-3 space-y-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="md"
            icon={<ActiveIcon className="h-4 w-4 shrink-0" />}
            iconRight={<ChevronDown className="h-4 w-4 shrink-0 text-text-faint" />}
            className={cn('h-11 w-full justify-start gap-2 px-3', cornerClass('flush'))}
            aria-label="Pairing mode"
          >
            <span className="min-w-0 flex-1 text-left text-role-caption font-semibold">
              {activeModeMeta.label}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="bottom"
          className="w-[var(--radix-dropdown-menu-trigger-width)] p-1"
        >
          {pairingModes.map((item) => {
            const Icon = item.icon;
            const selected = tab === item.id;
            return (
              <DropdownMenuItem
                key={item.id}
                onSelect={() => selectAvenue(item.id)}
                className="gap-2"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {selected ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5 text-text-soft" />
                  )}
                </span>
                {item.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {tab === 'zendesk' && t.hiddenLinked > 0 ? (
        <HoverTooltip label={`${t.hiddenLinked} ticket(s) already linked elsewhere are hidden`}>
          <span className="block text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
            {t.hiddenLinked} hidden
          </span>
        </HoverTooltip>
      ) : null}
    </div>
  ) : (
    <div ref={cardTopRef} className="mb-2 flex min-w-0 items-center gap-2">
      <HorizontalButtonSlider
        variant="nav"
        dense
        overlay
        className="min-w-0 flex-1"
        items={tabs}
        value={tab}
        onChange={(id) => setTab(id as MatchTab)}
        aria-label="Pairing tabs"
      />
      {tab === 'zendesk' && t.hiddenLinked > 0 ? (
        <HoverTooltip label={`${t.hiddenLinked} ticket(s) already linked elsewhere are hidden`}>
          <span className="ml-auto shrink-0 text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
            {t.hiddenLinked} hidden
          </span>
        </HoverTooltip>
      ) : null}
    </div>
  );

  const tabBody =
    tab === 'ecwid' ? (
      <EcwidProductSearchInline
        receivingId={receivingId}
        popoverMode="repair_service"
        initialOrderScope="all"
        chrome="bare"
        autoFocusSearch={autoFocusSearch}
        onSelect={u.handleAddLine}
        onClose={() => setTab('zoho_po')}
      />
    ) : tab === 'zoho_item' && tabSet === 'unbox' ? (
      <ZohoItemPairTab
        receivingId={receivingId}
        allowOffPo={orderLinked}
        onAddSku={(sel) => u.handleAddLine(sel, { allowOffPo: orderLinked })}
      />
    ) : tab === 'zoho_po' ? (
      <PoLinkTab
        row={row}
        receivingId={receivingId}
        autoFocusSearch={poFocusRequestId > 0}
        focusRequestId={poFocusRequestId}
      />
    ) : (
      <ZendeskMatchTab t={t} />
    );

  const body = (
    <div className="min-w-0 max-w-full">
      {/* Auto-match toolkit above Pairing — bare and card share this presentation. */}
      {!embedded && quickMatchStrip ? <div className="mb-3">{quickMatchStrip}</div> : null}

      {avenueSwitcher}
      {tabBody}
    </div>
  );

  const content = (
    <div className="min-w-0 max-w-full space-y-2">
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
    const quickMatchBlock = quickMatchStrip ? (
      <div
        className={
          showTopRule
            ? 'mt-2 border-t border-border-hairline pt-2'
            : 'mt-2'
        }
      >
        {quickMatchStrip}
      </div>
    ) : null;

    // Arrival accordion: header always visible; body height-animates.
    if (onToggleCollapsed) {
      return (
        <div className={showTopRule && !quickMatchStrip ? 'border-t border-border-hairline pt-4' : undefined}>
          {quickMatchBlock}
          <div className={quickMatchStrip ? 'mt-3 mb-1' : 'mb-1'}>
            <MatchHubHeader
              collapsed={collapsed}
              onToggle={onToggleCollapsed}
              actions={headerActions}
            />
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
      <div>
        {quickMatchBlock}
        <motion.div
          initial={false}
          layout="position"
          animate={
            collapsed
              ? { ...pairingCollapse.exit, marginTop: 0 }
              : {
                  ...pairingCollapse.animate,
                  marginTop: quickMatchStrip ? 12 : showTopRule ? 8 : 0,
                }
          }
          transition={pairingCollapseTransition}
          className={collapsed ? 'overflow-hidden' : 'overflow-visible'}
          aria-hidden={collapsed}
        >
          <div
            className={
              showTopRule && !quickMatchStrip
                ? 'border-t border-border-hairline pt-2'
                : undefined
            }
          >
            <div className="mb-2">
              <MatchHubHeader collapsed={collapsed} actions={headerActions} />
            </div>
            {content}
          </div>
        </motion.div>
      </div>
    );
  }

  if (bareChrome) {
    return <div className={PAIRING_FLUSH_HOST_CLASS}>{content}</div>;
  }

  return (
    <WorkspaceCard label="Package Pairing" overflow="visible" actions={headerActions}>
      {content}
    </WorkspaceCard>
  );
}

/** The Zendesk-tickets tab body — search + candidate match cards + delivery hints. */
function ZendeskMatchTab({ t }: { t: ReturnType<typeof useTriagePanel> }) {
  return (
    <>
      <div className="mb-2">
        <SearchBar
          value={t.matchQuery}
          onChange={t.setMatchQuery}
          placeholder="Search claim tickets by #, order, email, customer…"
          isSearching={t.candidatesFetching}
          variant="blue"
          size="compact"
          hideUnderline
        />
      </div>

      {t.candidatesLoading ? (
        <p className="flex items-center justify-center gap-2 py-5 text-xs text-text-soft">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading matches…
        </p>
      ) : t.candidatesError ? (
        <p
          className={cn(
            cornerClass('flush'),
            'border border-dashed border-rose-200 bg-rose-50 px-4 py-5 text-center text-xs text-rose-600',
          )}
        >
          Couldn’t load helpdesk matches. The helpdesk may not be connected.
        </p>
      ) : t.candidates.length === 0 ? (
        <p
          className={cn(
            cornerClass('flush'),
            'border border-dashed border-border-soft bg-surface-canvas px-4 py-5 text-center text-xs text-text-soft',
          )}
        >
          {t.matchQuery.trim()
            ? `No tickets match “${t.matchQuery.trim()}”.`
            : 'No recent claim tickets. Search by order #, email, or customer name.'}
        </p>
      ) : (
        <div className="space-y-2">
          {t.candidates.map((candidate) => (
            <MatchCard
              key={candidate.id}
              candidate={candidate}
              onLink={t.linkTicket}
              linking={t.linkingId === candidate.id}
              anyLinking={t.linkingId !== null}
            />
          ))}
        </div>
      )}

      {t.deliveredEmails.length > 0 ? (
        <div className="mt-3 border-t border-border-hairline pt-3">
          <WorkspaceSectionTitle as="p" className="mb-1.5">
            Marketplace delivery signals
          </WorkspaceSectionTitle>
          <div className="space-y-1">
            {t.deliveredEmails.map((sig, i) => (
              <div
                key={`${sig.orderNumber}-${i}`}
                className={cn(
                  'flex items-center gap-2 bg-violet-50/60 inset-cozy',
                  cornerClass('flush'),
                )}
              >
                <Mail className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-text-muted">
                  Order
                  <OrderIdChip value={sig.orderNumber} display={getLast8(sig.orderNumber)} dense />
                  {sig.deliveredAt ? (
                    <span className="truncate text-text-faint">· delivered {relativeTime(sig.deliveredAt)}</span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
