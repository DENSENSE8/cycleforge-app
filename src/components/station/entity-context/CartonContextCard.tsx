'use client';

import { useState } from 'react';
import { ChevronLeft } from '@/components/Icons';
import { getLast8, PoTotalChip, resolveChipDisplay } from '@/components/ui/CopyChip';
import { GridQtyFractionValue } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { Button } from '@/design-system/primitives';
import { ReceivingPhotoButton } from '@/components/receiving/workspace/line-edit/ReceivingPhotoButton';
import { IdentityLinkChip } from '@/components/receiving/workspace/line-edit/IdentityLinkChip';
import { ReceivingTicketChip } from '@/components/receiving/workspace/line-edit/ReceivingTicketChip';
import { FulfillmentPickupPill } from '@/components/receiving/ReceivingIdentityChips';
import { InlinePillPicker } from '@/components/receiving/workspace/line-edit/InlinePillPicker';
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
import { usePlatformCatalog, useReceivingTypeCatalog, usePlatformMeta } from '@/hooks/useCatalog';
import {
  formatListingLinkMenuOptions,
  type CartonListingLink,
} from '@/lib/receiving/listing-links';
import { platformMetaIconTone } from '@/lib/source-platform';
import { cn } from '@/utils/_cn';
import {
  STATION_CONTEXT_CLAIM_PILL_CLASS,
  STATION_CONTEXT_EXIT_PILL_CLASS,
  STATION_CONTEXT_STATUS_PILL_CLASS,
} from './station-context-action-pill';
import {
  STATION_IDENTITY_COMMERCE_ROW_CLASS,
  STATION_IDENTITY_GROUP_CLASS,
  STATION_IDENTITY_LEAD_COL_CLASS,
  STATION_IDENTITY_ROW_CLASS,
  STATION_IDENTITY_ROW_STACK_CLASS,
} from './station-identity-chrome';


/**
 * Carton-level context card — **station entity-context header (SoT)**.
 *
 * Public import for all stations:
 *   `import { CartonContextCard } from '@/components/station/entity-context'`
 *
 * Staff dropdown + photo strip, the listing / Zendesk / PO# / tracking chip
 * row. Identity editors now live in Unbox SectionTabsSlider tabs
 * (tracking/listings), not below-row drawers. PO is copy/open when linked;
 * unfound / no real Zoho PO id can pass `onEditPo` → Package Pairing (PO tab).
 *
 * **ONE face for every scan station** (ruled 2026-08-04): TWO semantic rows
 * filling the floating {@link StationContextBar} identity column (no card
 * chrome of its own). Pair hosts with
 * `StationWorkbench reserveIdentityClearance="stacked"`.
 *
 *   Row 1 — *"what kind of work is this"* — urgency · platform · type; Photos
 *           pinned trailing.
 *   Row 2 — *"which record"* — locked status pill · order#/PO# · tracking
 *           (left); price · listing · Claim/ticket on the SAME flush bottom
 *           row (`h-6` secondary band, gap-0).
 *
 * Secondary / exact triage detail (qty rollups, extra boxes, lineage,
 * exception routing, diagnostics) lives in right-edge **Displays** — never a
 * "Show details" expander under this identity band (guard:
 * `carton-context-details-in-displays.guard.test.ts`).
 *
 * CSS grid locks both rows — commerce never drops into a third band under
 * Photos. The exit chevron opens row 1 so it and the order chip share the
 * band's left edge. Never mix an identifier into row 1 or a classification
 * into row 2.
 * Omit optional props (`onMakeClaim`, `showStaffPhotoRow`, `lifecycle`,
 * `showPoTotal`, classify, …) to hide that affordance per station — do not
 * invent empty placeholder tracks.
 *
 * Former `card` and one-row `bar` densities are deleted. Thin adapters
 * (`LineCartonContextSection` · `TestingCartonHeader` ·
 * `ShippingEntityContextHeader` · `PackOrderIdentity` · `ReviewOrderIdentity` ·
 * `SupportOrderIdentity`) wire domain controllers only.
 *
 * Layout decisions preserved from the original inline implementation:
 *  - The listing chip uses a full-color brand tile ({@link PlatformMark}
 *    `preferBrandTile`) only when `tileSrc` exists (Amazon); other platforms
 *    show ExternalLink + label with no carton/FBA glyph. ExternalLink goes
 *    faint when there is no listing URL. Placeholder text when unbound.
 *  - Identity editing: listing/tracking editors accessible via chip edit actions,
 *    open external editing tabs. PO# is copy/open when linked; `onEditPo` opens
 *    Package Pairing → PO when there is no real Zoho PO id.
 *  - Classify chips open chip-anchored menus on the left only — right-side
 *    identity/actions are unchanged. Full Classify Displays stays the searchable
 *    editor when staff open that leaf themselves.
 *
 * Purely presentational/controlled — all state lives in the parent.
 */
export function CartonContextCard({
  receivingId,
  staffId,
  isUnmatched,
  classifyPending: _classifyPending = false,
  showClassifyControls = true,
  classifyInteractive = true,
  onMakeClaim,
  claimViewActive = false,
  showStaffPhotoRow = true,
  photoStage,
  listingLink,
  showListing = true,
  onEditListing,
  listingOpenHref,
  listingLinks = [],
  poOpenHref,
  trackingOpenHref,
  poDisplay,
  showOrderIdentity = true,
  onEditPo,
  poEditOpen = false,
  onOrderDetails,
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
  trackingEditOpen = false,
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
  showPoTotal = false,
  lifecycle = null,
  qty = null,
  onSendToTicket,
  onOpenMovePhotosExternal,
  onOpenPhotosDisplay,
  suppressPhotoHoverGallery = false,
}: {
  receivingId: number | null;
  staffId: string;
  isUnmatched: boolean;
  /**
   * Purchase-order money total, resolved by the adapter via `cartonPoTotal`
   * (`src/lib/receiving/po-total.ts`) — never summed in a view. `null` renders
   * the honest `—` (no line on this carton carries a mirrored price).
   * Displayed under Photos (before listing · Claim, gap-0 abut) when {@link showPoTotal}.
   */
  poTotal?: number | null;
  /**
   * Show the PO-total slot at all. Off by default so a station whose active
   * entity is not a purchase order (Shipping / Pack / Review / Support order
   * identity) never grows a money column it cannot fill.
   */
  showPoTotal?: boolean;
  /**
   * Resolved lifecycle status for row 2's leading pill — the SAME coarse stage
   * the operator just clicked in the sidebar rail. Resolve via the receiving
   * rail SoT (`getReceivingStatusDot` / `getReceivingStatusPillClass` /
   * `getReceivingStatusDotLabel`, `src/lib/receiving/rail/status.ts`); this
   * card never maps a status itself. Omit to hide.
   */
  lifecycle?: {
    dotClass: string;
    pillClass: string;
    label: string;
    tip?: string | null;
  } | null;
  /**
   * Carton-wide received / expected counts, resolved via `cartonQtyRollup`
   * (`src/lib/receiving/po-total.ts`) so this shares the PO total's carton
   * grain — never a per-line count beside a carton-wide total. Omit to hide.
   * Prefer Displays / PO lines for exact triage qty — this slot is a compact
   * face only when an adapter opts in.
   */
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
  /**
   * When false (with {@link showClassifyControls}), urgency / platform / type
   * render as read-only tone pills — facts for the station bar.
   * Default true = chip-anchored {@link InlinePillPicker} menus. Classify
   * Displays remains available when staff open that leaf themselves.
   */
  classifyInteractive?: boolean;
  /** Opens / toggles the claim push panel. Omit (undefined) to hide the Claim button. */
  onMakeClaim?: () => void;
  /** True while the Unbox Claim push column is open — Claim pill reads pressed. */
  claimViewActive?: boolean;
  /** Photos + Claim row. Hidden in triage (unbox-only). */
  showStaffPhotoRow?: boolean;
  /**
   * Carton capture stage the header photo pill stamps (stage SoT) — required,
   * never defaulted (a defaulted safety classification is how bench photos
   * silently became arrival evidence; see `.claude/rules/backend-patterns.md`).
   * Triage passes `arrival_package` explicitly; unbox chrome passes
   * `unbox_carton`. Item evidence never comes from this card — it is
   * line-scoped, so the active-line camera owns it.
   */
  photoStage: 'arrival_package' | 'unbox_carton';
  listingLink: string;
  /** Hide the listing slot for stations whose active entity has no storefront listing. */
  showListing?: boolean;
  /** Called when listing chip edit is requested - opens external editor. */
  onEditListing?: () => void;
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
   * Edit in the hover menu alongside Open + Details.
   */
  onEditPo?: () => void;
  /** Pulse the PO chip while Package Pairing (PO) is open. */
  poEditOpen?: boolean;
  /**
   * Open the in-app Incoming connection panel (PO mirror / sync / link CRUD)
   * on RightRailHost. Hover menu "Details".
   */
  onOrderDetails?: () => void;
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
  /** When true, pulses the tracking chip to show edit is active. */
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
   * Opt-in: toggle the Unbox Ticket push column (`?ticketView=1`) from the
   * ticket chip Edit row. Provided only by unbox `LineCartonContextSection` —
   * omitting it hides Edit (History still opens the thread popover).
   */
  onToggleTicketView?: () => void;
  /** True while the ticket push column is open — pulses the ticket chip Edit state. */
  ticketViewActive?: boolean;
  /**
   * Far-left back button that closes the active entity so the right pane
   * crossfades back to this page's list/history display (in-page — NOT a route
   * change). Wire each adapter's existing close handler; omit to hide the button.
   */
  onExitToList?: () => void;
  /** Tooltip + aria-label for the back button. Default "Back to list". */
  exitLabel?: string;
  /**
   * Opens SendPhotoNoteRail from the photo dropdown toolbar (unbox/triage).
   * Omit to hide the ticket icon in the gallery peek.
   */
  onSendToTicket?: () => void;
  /**
   * Unbox: open Move photos in the station tool push instead of a center overlay.
   */
  onOpenMovePhotosExternal?: () => void;
  /**
   * Unbox: double-click Photos pill → Displays → Photos (Actions). Replaces
   * whatever leaf is open. Omit on Arrival.
   */
  onOpenPhotosDisplay?: () => void;
  /**
   * Opt-out: suppress Photos hover toolbar. Unbox keeps the strip — Move /
   * Ticket open Displays via the external callbacks. Pill click stays
   * send-to-phone; double-click opens Displays when {@link onOpenPhotosDisplay}
   * is set.
   */
  suppressPhotoHoverGallery?: boolean;
}) {
  // One classify menu at a time — chip-anchored dropdown; identity band stays put.
  const [openPicker, setOpenPicker] = useState<'urgency' | 'platform' | 'type' | null>(null);

  const setClassifyMenu = (picker: 'urgency' | 'platform' | 'type' | null) => {
    if (picker != null && !classifyInteractive) return;
    setOpenPicker(picker);
  };

  // Canonical platform tone/label for the listing chip — same SoT the platform
  // pill and printed label read, so a platform never presents two ways.
  // Org-editable platform/type catalogs drive the pickers below (fall back to
  // the built-in lists until seeded). The platform tone/label resolver reads
  // the catalog too, so a renamed or custom platform reads correctly here.
  const platformCatalog = usePlatformCatalog();
  const typeCatalog = useReceivingTypeCatalog();
  const resolvePlatformMeta = usePlatformMeta();
  const platformMeta = resolvePlatformMeta(platformValue);

  // An imported return shows its PLATFORM on the listing chip; its originating
  // ORDER# stays a SEPARATE copy chip (the PO#/order# slot below), so the listing
  // link and the order id each copy/open on their own — never glued into one
  // "Amazon · <order#>" chip. poDisplay carries the order# (the import sets
  // receiving.zoho_purchaseorder_number as the display representative).
  const isReturn = receivingType.trim().toUpperCase() === 'RETURN';
  // A serial-resolved outbound order (a return) fills the PO#/order slot only
  // when the carton has no PO# of its own — never clobber a real bound PO#. Like
  // an imported-return order#, the lifted linkage reads copy-only (last-8): it is
  // not a Zoho PO, so no Zoho open + no inline editor.
  const linkedReturnOrder = (linkedOrderNumber ?? '').trim();
  const effectiveOrder = poDisplay || linkedReturnOrder;
  const orderCopyOnly = isReturn || (!poDisplay && !!linkedReturnOrder);
  const listingHasTarget = !!(listingLink || listingOpenHref);
  const listingLinkOptions = formatListingLinkMenuOptions(listingLinks);
  // Listing face: brand tile (Amazon) as iconOnly; platforms without tileSrc
  // use ExternalLink + label (no carton/FBA glyph fallback). Identity last-8
  // stays on PO# / TRK / ticket. Placeholder text when unbound / no platform.
  const listingUsesBrandTile = !!platformMeta.tileSrc;
  // Same paint ladder as PlatformMark — order `#` + listing ExternalLink.
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

  // Urgency is a tier picker: Auto + Priority/High/Medium/Low. Collapsed it
  // shows the *effective* tier — the manual override when set, else the
  // platform-derived rank (so a no-override carton still reads its auto urgency
  // at rest). Open it offers Auto (clear → derived) + the four manual tiers.
  const derivedRank = receivingPriorityRank(isUnmatched, platformValue, false);
  const derivedTone = receivingPriorityTone(derivedRank);
  const overrideMeta = priorityOverrideTier(priorityTier);
  const urgencyValue = priorityTier != null ? String(priorityTier) : 'auto';
  const effectiveUrgencyLabel = overrideMeta ? overrideMeta.label : derivedTone.label;
  const effectiveUrgencyClass = overrideMeta ? overrideMeta.activeClass : derivedTone.className;
  // In Auto mode the option matching the platform-derived urgency renders in
  // its active tone — the collapsed pill shows that derived label, so an open
  // picker highlighting only "Auto" read as if the current urgency were
  // unselected. Rank→tier mapping: Priority 0→0, unfound/untagged 1→High 1,
  // Amazon 2→High 1, eBay 3→Medium 2, Goodwill 4→Low 3; Other (9) highlights
  // nothing. Manual override set → normal value-match highlighting only.
  const RANK_TO_TIER: Record<number, number> = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 3 };
  const derivedTierEquivalent = priorityTier == null ? RANK_TO_TIER[derivedRank] ?? null : null;
  const urgencyOptions = urgencyClassifyOptions({
    derivedLabel: derivedTone.label,
    derivedTierEquivalent,
    autoActiveClass: 'border-border-default bg-surface-card text-text-muted',
  }).map((o) =>
    o.value === 'auto' ? { ...o, activeClass: effectiveUrgencyClass } : o,
  );
  const handleUrgencySelect = (v: string) =>
    onPrioritySelect?.(v === 'auto' ? null : Number(v));

  // Platform/Type identity faces come from shared builders (same SoT as the
  // Classify tab). Org catalog drives the option set; tones/marks stay built-in.
  const platformOptions = platformClassifyOptions({
    catalogOptions: platformCatalog.options,
    isUnmatched,
  });
  const typeOptions = typeClassifyOptions({ catalogOptions: typeCatalog.options });

  // Exit chevron — boxed flush face filling chrome row (h-full square).
  // Lead column is {@link STATION_IDENTITY_LEAD_COL_CLASS} so the
  // chevron and lifecycle dot centre on one x and fill the chrome row.
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

  /* Classify chip face — click opens a chip-anchored menu (presentation=menu).
     Unbox/Triage inline edit stays here; Displays Classify remains the full
     searchable leaf when staff open it from the rail / dock. */
  const classifyCluster = showClassifyControls ? (
    <div
      data-testid="carton-context-classify-pills"
      className={cn(STATION_IDENTITY_GROUP_CLASS, 'shrink-0')}
    >
      {showStaffPhotoRow ? (
        <InlinePillPicker
          ariaLabel="Urgency"
          options={urgencyOptions}
          value={urgencyValue}
          onSelect={handleUrgencySelect}
          collapsedLabel={effectiveUrgencyLabel}
          collapsedClass={effectiveUrgencyClass}
          collapsedFace="label"
          presentation="menu"
          open={openPicker === 'urgency'}
          onOpenChange={(o) => setClassifyMenu(o ? 'urgency' : null)}
          disabled={classifyInteractive ? !onPrioritySelect : false}
          readOnly={!classifyInteractive}
        />
      ) : null}
      <InlinePillPicker
        ariaLabel="Platform"
        options={platformOptions}
        value={platformValue}
        onSelect={onPlatformSelect}
        collapsedFace="label"
        presentation="menu"
        open={openPicker === 'platform'}
        onOpenChange={(o) => setClassifyMenu(o ? 'platform' : null)}
        disabled={classifyInteractive ? receivingId == null : false}
        readOnly={!classifyInteractive}
        placeholder={isUnmatched ? 'Unfound' : 'Platform'}
      />
      <InlinePillPicker
        ariaLabel="Type"
        options={typeOptions}
        value={receivingType}
        onSelect={onTypeSelect}
        collapsedFace="label"
        presentation="menu"
        open={openPicker === 'type'}
        onOpenChange={(o) => setClassifyMenu(o ? 'type' : null)}
        readOnly={!classifyInteractive}
        placeholder="Type"
      />
    </div>
  ) : null;

  /* Listing / external open — Amazon brand tile + ExternalLink when tileSrc
     exists; otherwise ExternalLink + platform label (no carton glyph). Hover:
     Copy, then Edit. Stacked pins this to row 2's leading commerce cluster. */
  const listingChip = showListing ? (
      <IdentityLinkChip
        openHref={listingOpenHref}
        openTitle={listingOpenTitle}
        linkOptions={listingLinkOptions}
        value={listingLink || listingOpenHref || ''}
        display={listingChipDisplay}
        // ExternalLink tone ONLY — brand tiles stay full color.
        iconClass={
          listingHasTarget && platformIconTone
            ? platformIconTone.className
            : 'text-text-faint'
        }
        iconStyle={
          listingHasTarget && platformIconTone ? platformIconTone.style : undefined
        }
        disableCopy={!(listingLink.trim() || listingOpenHref)}
        onEdit={onEditListing}
        editOpen={false}
        editLabel="Edit listing"
        actionsInMenu
        chipAction="open"
        menuFirstAction="copy"
        showExternalIcon
        iconOnly={listingUsesBrandTile}
        iconOnlyMark={
          listingUsesBrandTile ? (
            <PlatformMark
              platformValue={platformValue}
              preferBrandTile
              empty={!platformValue}
            />
          ) : undefined
        }
      />
  ) : null;

  /* Filed ticket# OR empty Claim CTA — row 2 trailing with price · listing
     (never beside Photos on row 1, never in the left identity strip). */
  const filedTicketChip =
    showStaffPhotoRow && zendeskTrimmed ? (
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
    ) : null;

  const claimCta =
    showStaffPhotoRow && !zendeskTrimmed && onMakeClaim ? (
      <HoverTooltip
        label={claimViewActive ? 'Hide claim' : 'File claim'}
        placement="above"
        asChild
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onMakeClaim}
          ariaLabel={claimViewActive ? 'Hide claim' : 'File claim'}
          aria-expanded={claimViewActive}
          className={STATION_CONTEXT_CLAIM_PILL_CLASS}
        >
          Claim
        </Button>
      </HoverTooltip>
    ) : null;

  const claimUnderPhotos = filedTicketChip ?? claimCta;

  /* Row 2 trailing — flush end-aligned price · listing · Claim/ticket
     (gap-0 abut, same grammar as classify). Sits on the SAME grid row as
     lifecycle · order# · tracking — never a third stacked band under Photos. */
  const commerceUnderPhotos =
    showPoTotal || listingChip || claimUnderPhotos ? (
      <div className={cn(STATION_IDENTITY_COMMERCE_ROW_CLASS, 'justify-end')}>
        {showPoTotal ? <PoTotalChip amount={poTotal} /> : null}
        {listingChip}
        {claimUnderPhotos}
      </div>
    ) : null;

  const photosCell =
    showStaffPhotoRow && receivingId != null ? (
      <ReceivingPhotoButton
        receivingId={receivingId}
        staffId={Number(staffId) || 0}
        poRef={effectiveOrder || null}
        photoStage={photoStage}
        // Open left of the pill so Claim under Photos stays clear. Unbox keeps
        // the hover action dropdown; Move / Ticket open Displays (right rail).
        // Click = phone; double-click = Displays Photos.
        galleryPlacement="left"
        onSendToTicket={onSendToTicket}
        onOpenMovePhotosExternal={onOpenMovePhotosExternal}
        onOpenPhotosDisplay={onOpenPhotosDisplay}
        suppressHoverGallery={suppressPhotoHoverGallery}
      />
    ) : null;

  /** True when the trailing (Photos / commerce) column mounts. */
  const photosClaimColumn = Boolean(photosCell || commerceUnderPhotos);

  /* PO# — or the originating ORDER# for a return: an imported RETURN shows its
     Zoho order#, and a serial-resolved return (scanned unit that was previously
     shipped) shows the closed-loop outbound order# lifted into this slot. Either
     way it's a copy chip SEPARATE from the listing link. Bound POs keep open +
     copy + Edit (Package Pairing) + Details (Incoming connection panel). Empty
     `# ----` clicks Edit directly when onEditPo is set. */
  const orderChip = showOrderIdentity ? (
    <IdentityLinkChip
      openHref={orderCopyOnly ? undefined : poOpenHref}
      openTitle={orderCopyOnly ? 'Order number' : 'Open purchase order'}
      value={effectiveOrder}
      display={effectiveOrder ? getLast8(effectiveOrder) : resolveChipDisplay('')}
      tone="id"
      lockLast8Width
      iconClass={platformIconTone?.className}
      iconStyle={platformIconTone?.style}
      platformLabel={platformValue ? platformMeta.label : null}
      disableCopy={!effectiveOrder}
      onEdit={onEditPo}
      editOpen={poEditOpen}
      editLabel={
        poEditOpen
          ? 'Hide package pairing'
          : effectiveOrder
            ? 'Edit order'
            : 'Link PO'
      }
      onDetails={onOrderDetails}
      detailsLabel="Show inspector"
      actionsInMenu
    />
  ) : null;

  /* Tracking# — MapPin tinted by carrier brand when known (UPS brown / FedEx
     purple / USPS light postal blue); house blue when unknown. Extra-box `+`
     sits on the chip. Suppressed for pickup. */
  const trackingSlot = isLocalPickup ? (
    <FulfillmentPickupPill
      variant="rail"
      tooltip="Fulfilled in person — no tracking number"
    />
  ) : (
    <div className="flex shrink-0 items-center gap-0">
      <IdentityLinkChip
        openHref={trackingOpenHref}
        openTitle="Open carrier tracking"
        value={primaryTrackingTrimmed}
        display={primaryTrackingTrimmed ? getLast8(primaryTrackingTrimmed) : resolveChipDisplay('')}
        tone="tracking"
        carrierHint={carrierHint}
        showCarrierBrand
        disableCopy={!primaryTrackingTrimmed}
        onEdit={onEditTracking}
        editOpen={trackingEditOpen}
        editLabel="Edit tracking"
        actionsInMenu
      />
      {filledExtraTrackingsCount > 0 ? (
        <HoverTooltip
          label={`${filledExtraTrackingsCount} extra box${filledExtraTrackingsCount === 1 ? '' : 'es'} on this PO`}
          asChild
        >
          <span className="shrink-0 rounded-none bg-surface-strong/90 px-0 py-0 text-role-eyebrow tabular-nums text-text-muted">
            +{filledExtraTrackingsCount}
          </span>
        </HoverTooltip>
      ) : null}
    </div>
  );

  // ── Two-row assembly (the only face) — CSS grid so row 2 is ONE flush band ─
  //
  //   Row 1 — classify (left) · Photos (right)
  //   Row 2 — lifecycle · order# · tracking (left) ·
  //           price · listing · Claim/ticket (right) — same row, gap-0
  //
  // Never mix the two: no identifier on row 1, no classification on row 2.
  // Never stack commerce under Photos in a third visual band.
  const hasExitLead = !!exitControl;
  const trailingCol = photosClaimColumn;

  const statusPill = lifecycle ? (
    <HoverTooltip label={lifecycle.tip || lifecycle.label} asChild>
      <span
        className={cn(STATION_CONTEXT_STATUS_PILL_CLASS, lifecycle.pillClass)}
        data-testid="carton-context-lifecycle-pill"
        aria-label={lifecycle.label}
      >
        {lifecycle.label}
      </span>
    </HoverTooltip>
  ) : null;

  const stackedLayout = (
    <div
      className={cn(
        'grid min-w-0 w-full flex-1 gap-0',
        trailingCol
          ? 'grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto]'
          : 'grid-cols-1 grid-rows-[auto_auto]',
      )}
      data-testid="carton-context-two-row"
    >
      {/* Row 1 left — what kind of work is this. */}
      <div className={cn(STATION_IDENTITY_ROW_CLASS, 'min-w-0')}>
        {hasExitLead ? (
          <div className={STATION_IDENTITY_LEAD_COL_CLASS}>{exitControl}</div>
        ) : null}
        {classifyCluster}
      </div>
      {/* Row 1 right — Photos; same PRIMARY face as classify · Exit (never taller). */}
      {trailingCol ? (
        <div className={cn(STATION_IDENTITY_ROW_CLASS, 'justify-end')}>{photosCell}</div>
      ) : null}
      {/* Row 2 left — locked status pill · order# · tracking (identifiers). */}
      <div className={cn(STATION_IDENTITY_COMMERCE_ROW_CLASS, 'min-w-0')}>
        {statusPill}
        {orderChip}
        {trackingSlot}
        {qty ? (
          <GridQtyFractionValue received={qty.received} expected={qty.expected} />
        ) : null}
      </div>
      {/* Row 2 right — price · listing · Claim flush on the same bottom row. */}
      {trailingCol ? (
        <div className="flex items-stretch justify-end self-stretch">
          {commerceUnderPhotos}
        </div>
      ) : null}
    </div>
  );

  const body = (
      <div className="px-0 py-0">
        <div className={STATION_IDENTITY_ROW_STACK_CLASS}>
          {/* Two-row identity — row 1 classify · Photos; row 2 status · order# ·
              tracking · price · listing · Claim as ONE flush bottom band.
              Classify chips open chip-anchored menus (identity band stays put). */}
          <div className="flex w-full min-w-0 max-w-full items-center">
            <div className="flex w-full max-w-full min-w-0 flex-nowrap items-center gap-0">
              {stackedLayout}
            </div>
          </div>
        </div>
      </div>
  );

  // Width comes from StationContextBar's identity measure
  // ({@link STATION_WORKBENCH_COLUMN} — white face + chips share the edge-to-edge measure).
  return <div className="w-full min-w-0 overflow-visible">{body}</div>;
}