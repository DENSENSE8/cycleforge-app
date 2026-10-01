'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Camera,
  ChevronLeft,
  ExternalLink,
  MessageSquare,
  Minus,
  MoreHorizontal,
  Receipt,
  Ticket,
} from '@/components/Icons';
import {
  CHIP_TONES,
  getLast8,
  resolveChipDisplay,
} from '@/components/ui/CopyChip';
import { GridQtyFractionValue } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  ChipHoverMenuSurface,
  type ChipHoverMenuRow,
} from '@/components/ui/ChipHoverMenuSurface';
import { ReceivingPhotoButton } from '@/components/receiving/workspace/line-edit/ReceivingPhotoButton';
import {
  StationContextClaimCell,
  StationContextDraftTicketCell,
  StationContextIconCell,
  StationContextListingCell,
} from './StationContextActionCell';
import { IdentityLinkChip } from '@/components/receiving/workspace/line-edit/IdentityLinkChip';
import { type CatalogKind } from '@/components/receiving/workspace/line-edit/CatalogManagerList';
import { ReceivingTicketChip } from '@/components/receiving/workspace/line-edit/ReceivingTicketChip';
import { FulfillmentPickupPill } from '@/components/receiving/ReceivingIdentityChips';
import { InlinePillPicker } from '@/components/receiving/workspace/line-edit/InlinePillPicker';
import { CatalogManagerPopover } from '@/components/receiving/workspace/line-edit/CatalogManagerPopover';
import {
  platformClassifyOptions,
  typeClassifyOptions,
  urgencyClassifyOptions,
} from '@/components/receiving/workspace/line-edit/classify-pill-options';
import {
  receivingPriorityRank,
  receivingPriorityTone,
} from '@/components/receiving/workspace/line-edit/receiving-priority';
import { priorityOverrideTier } from '@/lib/receiving/priority-override';
import {
  allowedTypesForPlatform,
  isTypeSettledForPlatform,
} from '@/lib/receiving/platform-type-rules';
import {
  usePlatformCatalog,
  usePlatformTypeRules,
  usePriorityCatalog,
  useReceivingTypeCatalog,
  usePlatformMeta,
} from '@/hooks/useCatalog';
import {
  formatListingLinkMenuOptions,
  type CartonListingLink,
} from '@/lib/receiving/listing-links';
import { platformMetaIconTone } from '@/lib/source-platform';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { cn } from '@/utils/_cn';
import {
  STATION_CONTEXT_EXIT_PILL_CLASS,
  STATION_CONTEXT_PHOTO_CHROME_CLASS,
} from './station-context-action-pill';
import {
  STATION_CHROME_CELL_CLASS,
  STATION_CHROME_CELL_INK,
  STATION_CHROME_CELL_PAD,
  STATION_CHROME_CELL_TEXT,
  STATION_CHROME_GLYPH_CLASS,
  STATION_CHROME_HOVER_CELL_CLASS,
  STATION_CHROME_ROW_CLASS,
  STATION_CHROME_ROW_FACE,
  STATION_CHROME_SEAM_HAIRLINE,
  STATION_IDENTITY_GROUP_CLASS,
  STATION_IDENTITY_LEAD_COL_CLASS,
} from './station-identity-chrome';
import {
  useCartonContextBarLayout,
  type CartonContextActionId,
} from './useCartonContextBarLayout';


/** Carton-level context card — **station entity-context header (SoT)**. */
export function CartonContextCard({
  receivingId,
  staffId,
  isUnmatched,
  classifyPending: _classifyPending = false,
  showClassifyControls = true,
  classifyInteractive = true,
  onMakeClaim,
  draftTicketNumber,
  claimViewActive = false,
  showStaffPhotoRow = true,
  photoStage,
  listingLink,
  showListing = true,
  listingOpenHref,
  listingLinks = [],
  poOpenHref,
  trackingOpenHref,
  poDisplay,
  showOrderIdentity = true,
  onEditPo,
  poEditOpen = false,
  linkedOrderNumber = null,
  lineId,
  zendeskTrimmed,
  zendeskHref,
  zendeskChipDisplay,
  providerTicketId = null,
  onTicketUnlinked,
  primaryTrackingTrimmed,
  filledExtraTrackingsCount,
  carrierHint = null,
  isLocalPickup = false,
  trackingEditOpen: _trackingEditOpen = false,
  onEditTracking,
  platformValue,
  onPlatformSelect,
  receivingType,
  onTypeSelect,
  priorityTier = null,
  onPrioritySelect,
  onToggleTicketView,
  ticketViewActive = false,
  onExitToList,
  exitLabel = 'Back to list',
  poTotal = null,
  showPoTotal = true,
  qty = null,
  onSendToTicket,
  photosCell = null,
  assigneeCell = null,
}: {
  receivingId: number | null;
  staffId: string;
  isUnmatched: boolean;
  /** Purchase-order money total, resolved by the adapter via `cartonPoTotal` (`src/lib/receiving/po-total.ts`) — never summed in a view. */
  poTotal?: number | null;
  /**
   * Show the PO-total / price slot. Default on — the top-right chrome always
   * paints price (honest `—` when unknown), listing, and photos.
   */
  showPoTotal?: boolean;
  /** Carton-wide received / expected counts, resolved via `cartonQtyRollup` (`src/lib/receiving/po-total.ts`) so this shares the PO total's… */
  qty?: { received: number; expected: number | null } | null;
  /**
   * The carton still needs its intake kind (unbox stepper's Classify dot is
   * active) — auto-expand the classify pills so this header IS the classify
   * surface, expanded. Set only for unclassified unfound cartons.
   */
  classifyPending?: boolean;
  /**
   * When false, hide platform/type/urgency pills from this header.
   */
  showClassifyControls?: boolean;
  /** When false (with {@link showClassifyControls}), urgency / platform / type render as read-only tone pills — facts for the station bar. */
  classifyInteractive?: boolean;
  /** Opens / toggles the claim push panel. Omit (undefined) to hide the Claim button. */
  onMakeClaim?: () => void;
  /** The DRAFT ticket number (`#12345`) while an unlinked carton has a claim body typed but not filed. */
  draftTicketNumber?: string | null;
  /** True while the Unbox Claim push column is open — Claim pill reads pressed. */
  claimViewActive?: boolean;
  /** Photos + Claim row. Hidden in triage (unbox-only). */
  showStaffPhotoRow?: boolean;
  /** Carton capture stage the header photo pill stamps (stage SoT) — required, never defaulted (a defaulted safety classification is how… */
  photoStage: 'arrival_package' | 'unbox_carton';
  listingLink: string;
  /** Hide the listing slot for stations whose active entity has no storefront listing. */
  showListing?: boolean;
  listingOpenHref: string | null | undefined;
  /** All resolvable listing URLs (inventory catalog + manual + derived). */
  listingLinks?: CartonListingLink[];
  /** External link target for the PO# chip (Zoho purchase order). */
  poOpenHref: string | null | undefined;
  /** External link target for the tracking# chip (carrier tracking page). */
  trackingOpenHref: string | null | undefined;
  /** Already-trimmed PO# (number ?? id) for the chip + editor seed. */
  poDisplay: string;
  /** Hide the PO/order identifier slot when the station has no identity yet. */
  showOrderIdentity?: boolean;
  /**
   * Open Package Pairing → PO tab (link / change / import a Zoho PO). Always
   * offered when set — empty `# ----` clicks this directly; linked chips keep
   * Edit in the hover menu alongside Open.
   */
  onEditPo?: () => void;
  /** Pulse the PO chip while Package Pairing (PO) is open — steady `editing` face, no flash. */
  poEditOpen?: boolean;
  /**
   * Serial-resolved outbound (return) order#. Fills the PO#/order chip (last-8,
   * copy-only) ONLY when the carton has no PO# of its own — never clobbers a
   * bound PO#. This is the lifted LINKAGE identity (the standalone panel is gone).
   */
  linkedOrderNumber?: string | null;
  /** Active line id — the entity a filed ticket is linked to (RECEIVING_LINE). */
  lineId: number | null;
  zendeskTrimmed: string;
  zendeskHref: string | null | undefined;
  zendeskChipDisplay: string;
  providerTicketId?: number | null;
  /** Called after the ticket chip's popover unlinks the ticket — clears it. */
  onTicketUnlinked?: () => void;
  primaryTrackingTrimmed: string;
  filledExtraTrackingsCount: number;
  /**
   * Stored carrier label/code from the line / shipment. Prefer over regex
   * detect for brand tile paint (same ladder as Open URL).
   */
  carrierHint?: string | null;
  /** Local-pickup fulfillment — suppress tracking chip/editor; show Pickup pill. */
  isLocalPickup?: boolean;
  /** When true, tracking chip face reads steady `editing` (no pulse). */
  trackingEditOpen?: boolean;
  /** Called when tracking chip edit is requested - opens external editor. */
  onEditTracking?: () => void;
  platformValue: string;
  onPlatformSelect: (v: string) => void;
  receivingType: string;
  onTypeSelect: (v: string) => void;
  /** Manual priority-tier override (receiving.priority_tier): null = Auto, 0..3. */
  priorityTier?: number | null;
  /** Set/clear the priority tier (null = Auto). Omit to render urgency display-only. */
  onPrioritySelect?: (tier: number | null) => void;
  /**
   * Select the caller-owned Ticket task from the ticket chip. Omit to hide the
   * edit verb; History still opens the thread popover.
   */
  onToggleTicketView?: () => void;
  /** True while the Ticket task is selected; History stays non-pulsing. */
  ticketViewActive?: boolean;
  /** Far-left back button that closes the active entity so the right pane crossfades back to this page's list/history display (in-page — NOT… */
  onExitToList?: () => void;
  /** Tooltip + aria-label for the back button. Default "Back to list". */
  exitLabel?: string;
  /**
   * Opens SendPhotoNoteRail from the photo dropdown toolbar (unbox/triage).
   * Omit to hide the ticket icon in the gallery peek.
   */
  onSendToTicket?: () => void;
  /** Station-owned Photos track (e.g. */
  photosCell?: ReactNode;
  /** Station-owned assignee cell (QC bench: the line's QC tech) — leads the right cluster. */
  assigneeCell?: ReactNode;
}) {
  // One classify menu at a time — chip-anchored dropdown; identity band stays put.
  const [openPicker, setOpenPicker] = useState<'urgency' | 'platform' | 'type' | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const overflowAnchorRef = useRef<HTMLDivElement | null>(null);
  // Freeze the responsive decision while a classify menu is open.
  const { classifyCompact, overflowActions } = useCartonContextBarLayout(
    barRef,
    openPicker != null,
  );
  const overflowSet = new Set<CartonContextActionId>(overflowActions);

  /** Ownership-scoped: */
  const setClassifyMenu = (
    picker: 'urgency' | 'platform' | 'type',
    next: boolean,
  ) => {
    if (next && !classifyInteractive) return;
    setOpenPicker((prev) => (next ? picker : prev === picker ? null : prev));
  };

  /** "Edit" / "Edit colours" on the platform / type menus opens the org catalog manager — the ONE place `platforms.color_hex` and the catalog… */
  const [catalogManager, setCatalogManager] = useState<CatalogKind | null>(null);

  // Canonical platform tone/label for the listing chip — same SoT the platform pill and printed label read, so a platform never presents two…
  const platformCatalog = usePlatformCatalog();
  const typeCatalog = useReceivingTypeCatalog();
  const platformTypeRules = usePlatformTypeRules();
  const priorityCatalog = usePriorityCatalog();
  const resolvePlatformMeta = usePlatformMeta();
  const platformMeta = resolvePlatformMeta(platformValue);

  // An imported return shows its PLATFORM on the listing chip; its originating ORDER# stays a SEPARATE copy chip (the PO#/order# slot…
  const isReturn = receivingType.trim().toUpperCase() === 'RETURN';
  // A serial-resolved outbound order (a return) fills the PO#/order slot only when the carton has no PO# of its own — never clobber a real…
  const linkedReturnOrder = (linkedOrderNumber ?? '').trim();
  const effectiveOrder = poDisplay || linkedReturnOrder;
  const orderCopyOnly = isReturn || (!poDisplay && !!linkedReturnOrder);
  const listingHasTarget = !!(listingLink || listingOpenHref);
  // Listing face:
  const platformIconTone = platformValue ? platformMetaIconTone(platformMeta) : null;
  const listingChipDisplay = platformValue
    ? platformMeta.label
    : isReturn
      ? 'Return'
      : listingHasTarget
        ? isUnmatched
          ? 'Unfound'
          : 'Listing'
        : resolveChipDisplay('');
  const listingOpenTitle = platformValue
    ? `Open ${platformMeta.label} listing in new tab`
    : 'Open listing in new tab';

  // Urgency header list is Low / Medium / High. Collapsed face shows the
  // effective heat (manual pin, else platform-derived). Priority pins paint as
  // High; Auto is not a header option (full Classify editor still has it).
  const derivedRank = receivingPriorityRank(isUnmatched, platformValue, false);
  const derivedTone = receivingPriorityTone(derivedRank);
  const overrideMeta = priorityOverrideTier(priorityTier);
  const RANK_TO_TIER: Record<number, number> = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 3 };
  const derivedTierEquivalent = priorityTier == null ? RANK_TO_TIER[derivedRank] ?? null : null;
  const headerUrgencyTier =
    priorityTier != null && priorityTier !== 0
      ? priorityTier
      : priorityTier === 0
        ? 1
        : derivedTierEquivalent === 0
          ? 1
          : (derivedTierEquivalent ?? 3);
  const urgencyValue = String(headerUrgencyTier);
  const effectiveUrgencyLabel =
    overrideMeta && overrideMeta.value !== 0 ? overrideMeta.label : derivedTone.label === 'Priority' ? 'High' : derivedTone.label;
  const effectiveUrgencyClass = overrideMeta ? overrideMeta.activeClass : derivedTone.className;
  const urgencyOptions = urgencyClassifyOptions({
    derivedLabel: derivedTone.label,
    derivedTierEquivalent,
    autoActiveClass: 'border-border-default bg-surface-card text-text-muted',
    surface: 'header',
    // Org renames / accents skin the rungs; the ladder itself stays the code
    // constant, so this can only change how a tier reads, never which exist.
    catalogOptions: priorityCatalog.options,
  });
  const handleUrgencySelect = (v: string) => onPrioritySelect?.(Number(v));

  // Platform/Type identity faces come from shared builders (same SoT as the
  // Classify tab). Org catalog drives the option set; tones/marks stay built-in.
  const platformOptions = platformClassifyOptions({
    catalogOptions: platformCatalog.options,
    isUnmatched,
  });
  /** Type is a DEPENDENT picklist: */
  const allowedTypes = allowedTypesForPlatform(platformTypeRules, platformValue);
  const typeOptions = useMemo(() => {
    const all = typeClassifyOptions({ catalogOptions: typeCatalog.options });
    if (!allowedTypes) return all;
    const keep = new Set(allowedTypes.map((t) => t.toUpperCase()));
    const current = receivingType.trim().toUpperCase();
    return all.filter((o) => {
      const v = String(o.value ?? '').trim().toUpperCase();
      return !v || keep.has(v) || v === current;
    });
  }, [typeCatalog.options, allowedTypes, receivingType]);

  /** One legal answer left AND the carton already says it → the pill is not a question. */
  const typeLocked = isTypeSettledForPlatform(platformTypeRules, platformValue, receivingType);

  // Exit chevron — flush cube filling chrome row. Identity run (order #,
  // tracking) abuts it with no hairline.
  const exitControl = onExitToList ? (
    <HoverTooltip label={exitLabel} asChild>
      {/* Boxed flush cube — own carton-context face (not scan-bar mode chrome). */}
      <button
        type="button"
        onClick={onExitToList}
        aria-label={exitLabel}
        className={STATION_CONTEXT_EXIT_PILL_CLASS}
        data-testid="carton-context-exit"
      >
        <ChevronLeft className="block h-3.5 w-3.5 shrink-0" aria-hidden />
      </button>
    </HoverTooltip>
  ) : null;

  const classifyFace = classifyCompact ? 'dot' : 'label';
  /** Middle — the classifications an operator CHOOSES (priority · platform · type), absolutely centered. */
  const classifyCluster = showClassifyControls ? (
    <div
      data-testid="carton-context-classify-pills"
      data-carton-bar-slot="classify"
      data-type-locked={typeLocked ? 'true' : 'false'}
      className={cn(STATION_IDENTITY_GROUP_CLASS, 'shrink-0')}
    >
      {showStaffPhotoRow ? (
        <InlinePillPicker
          ariaLabel="Urgency"
          options={urgencyOptions}
          value={urgencyValue}
          onSelect={handleUrgencySelect}
          collapsedLabel={classifyCompact ? (urgencyOptions.find((o) => o.value === urgencyValue)?.shortLabel ?? effectiveUrgencyLabel) : effectiveUrgencyLabel}
          collapsedClass={effectiveUrgencyClass}
          collapsedFace={classifyFace}
          presentation="menu"
          open={openPicker === 'urgency'}
          onOpenChange={(o) => setClassifyMenu('urgency', o)}
          disabled={classifyInteractive ? !onPrioritySelect : false}
          readOnly={!classifyInteractive}
          onEditCatalog={classifyInteractive ? () => setCatalogManager('priority') : undefined}
        />
      ) : null}
      <InlinePillPicker
        ariaLabel="Platform"
        options={platformOptions}
        value={platformValue}
        onSelect={onPlatformSelect}
        // The channel is a WORD, not a colour.
        collapsedFace={classifyFace}
        collapsedLabel={
          classifyCompact
            ? (platformOptions.find((o) => o.value === platformValue)?.shortLabel)
            : undefined
        }
        presentation="menu"
        open={openPicker === 'platform'}
        onOpenChange={(o) => setClassifyMenu('platform', o)}
        disabled={classifyInteractive ? receivingId == null : false}
        readOnly={!classifyInteractive}
        placeholder={isUnmatched ? 'Unfound' : 'Platform'}
        onEditCatalog={classifyInteractive ? () => setCatalogManager('platform') : undefined}
        editCatalogLabel="Edit platforms"
      />
      <InlinePillPicker
        ariaLabel="Type"
        options={typeOptions}
        value={receivingType}
        onSelect={onTypeSelect}
        collapsedLabel={classifyCompact ? (typeOptions.find((o) => o.value === receivingType)?.shortLabel) : undefined}
        collapsedFace={classifyFace}
        presentation="menu"
        open={openPicker === 'type'}
        onOpenChange={(o) => setClassifyMenu('type', o)}
        readOnly={!classifyInteractive || typeLocked}
        placeholder="Type"
        onEditCatalog={classifyInteractive ? () => setCatalogManager('type') : undefined}
      />
    </div>
  ) : null;


  /** Order id — ONE face for every scan station. */
  const orderChip = showOrderIdentity ? (
    <IdentityLinkChip
      openHref={!effectiveOrder || orderCopyOnly ? undefined : poOpenHref}
      openTitle={orderCopyOnly ? 'Order number' : 'Open purchase order'}
      value={effectiveOrder}
      display={effectiveOrder ? getLast8(effectiveOrder) : 'Pair'}
      tone="id"
      lockLast8Width={Boolean(effectiveOrder)}
      iconClass={platformIconTone?.className}
      iconStyle={platformIconTone?.style}
      platformLabel={platformValue ? platformMeta.label : null}
      disableCopy={!effectiveOrder}
      onEdit={onEditPo}
      editOpen={false}
      editLabel={
        poEditOpen
          ? 'Hide package pairing'
          : effectiveOrder
            ? 'Edit order'
            : 'Pair package'
      }
      actionsInMenu
    />
  ) : null;

  /** Platform mark — the channel fact for a bar with NO classify cluster. */
  const platformFace =
    !classifyCluster && platformValue && platformMeta.value ? (
      <HoverTooltip label={platformMeta.label} asChild focusable={false}>
        <span
          className={cn(STATION_CHROME_CELL_CLASS, STATION_CHROME_CELL_PAD)}
          aria-label={platformMeta.label}
        >
          <PlatformMark platformValue={platformMeta.value} meta={platformMeta} />
        </span>
      </HoverTooltip>
    ) : null;

  /** Tracking# — ONE face for every scan station; Unbox is the SoT. */
  const trackingExtraBoxes =
    filledExtraTrackingsCount > 0 ? (
      <HoverTooltip
        label={`${filledExtraTrackingsCount} extra box${filledExtraTrackingsCount === 1 ? '' : 'es'} on this PO`}
        asChild
      >
        <span
          className={cn(
            'shrink-0 rounded-none bg-surface-strong/90 px-0 py-0',
            STATION_CHROME_CELL_TEXT,
            STATION_CHROME_CELL_INK,
          )}
        >
          +{filledExtraTrackingsCount}
        </span>
      </HoverTooltip>
    ) : null;

  const trackingSlot = isLocalPickup ? (
    <div className={STATION_CHROME_HOVER_CELL_CLASS}>
      <FulfillmentPickupPill
        variant="rail"
        tooltip="Fulfilled in person — no tracking number"
      />
    </div>
  ) : (
    <div className={STATION_CHROME_HOVER_CELL_CLASS}>
      <IdentityLinkChip
        openHref={trackingOpenHref}
        openTitle="Open carrier tracking"
        value={primaryTrackingTrimmed}
        display={
          primaryTrackingTrimmed ? getLast8(primaryTrackingTrimmed) : resolveChipDisplay('')
        }
        tone="tracking"
        carrierHint={carrierHint}
        lockLast8Width
        disableCopy={!primaryTrackingTrimmed}
        onEdit={onEditTracking}
        editOpen={false}
        editLabel="Edit tracking"
        actionsInMenu
      />
      {trackingExtraBoxes}
    </div>
  );

  const listingIconButton = showListing ? (
    <StationContextListingCell
      label={listingChipDisplay}
      ariaLabel={listingOpenTitle}
      disabled={!listingHasTarget}
      onClick={() => {
        if (listingOpenHref) window.open(listingOpenHref, '_blank', 'noopener,noreferrer');
      }}
      iconClass={
        listingHasTarget && platformIconTone
          ? platformIconTone.className
          : 'text-text-faint'
      }
      iconStyle={listingHasTarget && platformIconTone ? platformIconTone.style : undefined}
      openHref={listingOpenHref}
      copyValue={listingLink || listingOpenHref || ''}
      links={formatListingLinkMenuOptions(listingLinks) ?? listingLinks}
    />
  ) : null;

  const draftNumberFace = (draftTicketNumber ?? '').trim();

  const claimIconButton =
    showStaffPhotoRow && !zendeskTrimmed && onMakeClaim && !overflowSet.has('claim') ? (
      <div className="flex min-h-0 self-stretch items-stretch">
        {draftNumberFace ? (
          // The draft number REPLACES the Claim verb rather than sitting beside
          // it — the corner is one slot, and two ticket controls in it is the
          // duplicate this card exists to avoid.
          <StationContextDraftTicketCell
            active={claimViewActive}
            onClick={onMakeClaim}
            number={draftNumberFace}
          />
        ) : (
          <HoverTooltip label={claimViewActive ? 'Hide claim' : 'File claim'} asChild>
            <StationContextClaimCell active={claimViewActive} onClick={onMakeClaim} />
          </HoverTooltip>
        )}
      </div>
    ) : null;

  const ticketInline =
    showStaffPhotoRow && zendeskTrimmed && !overflowSet.has('claim') ? (
      <div className={STATION_CHROME_HOVER_CELL_CLASS}>
      <ReceivingTicketChip
        value={zendeskTrimmed}
        display={zendeskChipDisplay}
        openHref={zendeskHref}
        providerTicketId={providerTicketId}
        receivingId={receivingId}
        lineId={lineId}
        onUnlinked={() => {
          onTicketUnlinked?.();
        }}
        onOpenTicketView={
          onToggleTicketView && providerTicketId != null
            ? () => onToggleTicketView()
            : undefined
        }
        ticketViewActive={ticketViewActive}
      />
      </div>
    ) : null;

  // Photos stay on the bar even at 0 and even without a receiving id.
  const emptyPhotosCell = (
    <span
      className={STATION_CONTEXT_PHOTO_CHROME_CLASS}
      data-testid="carton-context-photos"
      aria-label="Photos: 0"
      role="img"
    >
      <Camera className={STATION_CHROME_GLYPH_CLASS} aria-hidden />
      <span className="leading-none tabular-nums">0</span>
    </span>
  );

  const photosCellNode =
    photosCell != null
      ? photosCell
      : receivingId != null ? (
          <ReceivingPhotoButton
            receivingId={receivingId}
            staffId={Number(staffId) || 0}
            poRef={effectiveOrder || null}
            photoStage={photoStage}
            appearance="chrome"
            galleryPlacement="below"
            onSendToTicket={onSendToTicket}
          />
        ) : (
          emptyPhotosCell
        );

  /**
   * Overflow rows — the SAME verbs the inline cells offer, never a second list.
   * Spillover changes where a verb lives, not which verbs exist.
   */
  const overflowItems: ChipHoverMenuRow[] = [];
  if (showStaffPhotoRow && !zendeskTrimmed && onMakeClaim && overflowSet.has('claim')) {
    overflowItems.push({
      id: 'claim',
      label: draftNumberFace
        ? `Draft ticket ~${draftNumberFace} — not filed yet`
        : claimViewActive
          ? 'Hide claim'
          : 'File claim',
      icon: <Ticket className="h-3.5 w-3.5" />,
      onSelect: () => {
        onMakeClaim();
        setOverflowOpen(false);
      },
    });
  }
  if (showStaffPhotoRow && zendeskTrimmed && overflowSet.has('claim')) {
    overflowItems.push({
      id: 'ticket-open',
      label: `Open ticket ${zendeskChipDisplay}`,
      icon: <ExternalLink className="h-3.5 w-3.5" />,
      tone: 'accent',
      onSelect: () => {
        if (zendeskHref) window.open(zendeskHref, '_blank', 'noopener,noreferrer');
        setOverflowOpen(false);
      },
    });
    if (onToggleTicketView && providerTicketId != null) {
      overflowItems.push({
        id: 'ticket-view',
        label: ticketViewActive ? 'Hide ticket editor' : 'Ticket history',
        icon: <MessageSquare className="h-3.5 w-3.5" />,
        onSelect: () => {
          onToggleTicketView();
          setOverflowOpen(false);
        },
      });
    }
  }

  const overflowMenu =
    overflowItems.length > 0 ? (
      /** Same panel as every other cell on this bar — the ⋯ differs only in being CLICK-opened (there is no identity to peek at, so hover would… */
      <div ref={overflowAnchorRef} className="flex h-full shrink-0 items-stretch">
        <StationContextIconCell
          ariaLabel="More actions"
          testId="carton-context-overflow"
          onClick={() => setOverflowOpen((o) => !o)}
        >
          <MoreHorizontal className={STATION_CHROME_GLYPH_CLASS} />
        </StationContextIconCell>
        <ChipHoverMenuSurface
          open={overflowOpen}
          onClose={() => setOverflowOpen(false)}
          anchorRef={overflowAnchorRef}
          menuLabel="More actions"
          rows={overflowItems}
        />
      </div>
    ) : null;

  const priceMissing = poTotal == null || !Number.isFinite(poTotal) || poTotal <= 0;
  const priceFace = showPoTotal ? (
    <span
      className={cn(
        STATION_CHROME_CELL_CLASS,
        STATION_CHROME_CELL_PAD,
        `gap-0.5 ${STATION_CHROME_CELL_TEXT} ${STATION_CHROME_CELL_INK}`,
      )}
      data-testid="carton-context-price"
      aria-label={priceMissing ? 'No price' : `Price ${poTotal.toFixed(2)}`}
    >
      <span className={CHIP_TONES.price.iconClass} aria-hidden>
        <Receipt className={STATION_CHROME_GLYPH_CLASS} />
      </span>
      {priceMissing ? (
        <Minus className={STATION_CHROME_GLYPH_CLASS} aria-hidden />
      ) : (
        poTotal.toFixed(2)
      )}
    </span>
  ) : null;

  const oneRowBar = (
    <div
      ref={barRef}
      className={cn(
        'relative flex w-full min-w-0 flex-nowrap items-stretch overflow-visible',
        STATION_CHROME_ROW_FACE,
        STATION_CHROME_SEAM_HAIRLINE,
        // Owns the hover display for every cell inside it — see
        // `.cf-chrome-row` in styles/globals.css.
        STATION_CHROME_ROW_CLASS,
      )}
      data-testid="carton-context-one-row"
    >
      {/* Middle — classify, centered on the full bar (not leftover flex). */}
      {classifyCluster ? (
        <div className="pointer-events-none absolute inset-0 flex items-stretch justify-center overflow-visible">
          <div className="pointer-events-auto flex items-stretch">{classifyCluster}</div>
        </div>
      ) : null}

      <div
        data-carton-bar-slot="identity"
        className="relative z-raised flex shrink-0 items-stretch gap-0"
      >
        {exitControl ? (
          <div className={STATION_IDENTITY_LEAD_COL_CLASS}>{exitControl}</div>
        ) : null}
        <div className="flex h-full shrink-0 items-stretch [&_[data-chip-face]]:rounded-none">
          {platformFace}
          {/* Order # is a copy/menu target, so it gets the same cell box as every other interactive cell. */}
          {orderChip ? (
            <div className={STATION_CHROME_HOVER_CELL_CLASS}>{orderChip}</div>
          ) : null}
          {trackingSlot}
          {qty ? (
            <div className={STATION_CHROME_CELL_CLASS}>
              <GridQtyFractionValue received={qty.received} expected={qty.expected} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Right — quiet price + icon actions; ⋯ before wrap */}
      <div data-carton-bar-slot="actions" className="relative ml-auto flex shrink-0 items-stretch">
        {assigneeCell ? <div className={STATION_CHROME_HOVER_CELL_CLASS}>{assigneeCell}</div> : null}
        {priceFace}
        {listingIconButton}
        {ticketInline ?? claimIconButton}
        {photosCellNode}
        {overflowMenu}
      </div>

      {/* Catalog manager — opened by "Edit colours" on the platform / type menus. */}
      {catalogManager ? (
        <CatalogManagerPopover
          open
          kind={catalogManager}
          onClose={() => setCatalogManager(null)}
        />
      ) : null}
    </div>
  );

  return (
    <div className="relative w-full min-w-0 overflow-visible">{oneRowBar}</div>
  );
}
