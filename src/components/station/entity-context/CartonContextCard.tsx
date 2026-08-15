'use client';

import { useRef, useState } from 'react';
import { ChevronLeft, ExternalLink, MoreHorizontal, Pencil, Receipt, Ticket } from '@/components/Icons';
import {
  CHIP_TONES,
  getLast8,
  OrderIdChip,
  resolveChipDisplay,
  TrackingChip,
} from '@/components/ui/CopyChip';
import { GridQtyFractionValue } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
} from '@/design-system/primitives';
import { ReceivingPhotoButton } from '@/components/receiving/workspace/line-edit/ReceivingPhotoButton';
import { IdentityLinkChip } from '@/components/receiving/workspace/line-edit/IdentityLinkChip';
import { ReceivingTicketChip } from '@/components/receiving/workspace/line-edit/ReceivingTicketChip';
import { FulfillmentPickupPill } from '@/components/receiving/ReceivingIdentityChips';
import { ClassifyColorEditPopover } from '@/components/receiving/workspace/line-edit/ClassifyColorEditPopover';
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
import { useTypeColorOverrides } from '@/lib/receiving/type-color-overrides';
import {
  type CartonListingLink,
} from '@/lib/receiving/listing-links';
import { platformMetaIconTone } from '@/lib/source-platform';
import { cn } from '@/utils/_cn';
import {
  STATION_CONTEXT_ACTION_CELL_CLASS,
  STATION_CONTEXT_EXIT_PILL_CLASS,
} from './station-context-action-pill';
import {
  STATION_CHROME_CELL_CLASS,
  STATION_CHROME_CELL_PAD,
  STATION_CHROME_GLYPH_CLASS,
  STATION_CHROME_ROW_FACE,
  STATION_CHROME_SEAM_HAIRLINE,
  STATION_IDENTITY_GROUP_CLASS,
  STATION_IDENTITY_LEAD_COL_CLASS,
} from './station-identity-chrome';
import {
  useCartonContextBarLayout,
  type CartonContextActionId,
} from './useCartonContextBarLayout';


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
 * **ONE face for every scan station**: ONE semantic row filling the floating
 * {@link StationContextBar} identity column (no card chrome of its own).
 * Pair hosts with `StationWorkbench reserveIdentityClearance={false}` (in-flow)
 * or legacy overlay clearance.
 *
 *   Left — identity: back · status dot · order# · tracking#
 *   Middle — classify: priority · platform · type. Collapses
 *            first (dots-only / shortLabel) when the row is tight.
 *   Right — actions: quiet price · listing · claim · photos as icon buttons.
 *            Those three verbs overflow into `⋯` before the row wraps.
 *
 * Secondary / exact triage detail (qty rollups, extra boxes, lineage,
 * exception routing, diagnostics) lives in right-edge **Displays** — never a
 * "Show details" expander under this identity band (guard:
 * `carton-context-details-in-displays.guard.test.ts`).
 *
 * The bar never wraps. Classify pills collapse and trailing verbs park in
 * `⋯` before a second row appears. Status is a 6–8px colored dot, not a
 * RECEIVED pill. Listing / claim / photos are icon buttons — no brand tiles.
 * Omit optional props (`onMakeClaim`, `showStaffPhotoRow`, `lifecycle`,
 * `showPoTotal`, classify, …) to hide that affordance per station — do not
 * invent empty placeholder tracks.
 *
 * Thin adapters
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
  /** Pulse the PO chip while Package Pairing (PO) is open — steady `editing` face, no flash. */
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
   * Opt-in: toggle the Unbox Ticket push column (`?ticketView=1`) from the
   * ticket chip Edit row. Provided only by unbox `LineCartonContextSection` —
   * omitting it hides Edit (History still opens the thread popover).
   */
  onToggleTicketView?: () => void;
  /** True while the ticket push column is open — ticket History stays non-pulsing. */
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
  const [colorEditOpen, setColorEditOpen] = useState(false);
  const colorEditAnchorRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const { classifyCompact, overflowActions } = useCartonContextBarLayout(barRef);
  const overflowSet = new Set<CartonContextActionId>(overflowActions);

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
  const typeColorOverrides = useTypeColorOverrides();
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
  // Listing face: brand tile (Amazon) as iconOnly; platforms without tileSrc
  // use ExternalLink + label (no carton/FBA glyph fallback). Identity last-8
  // stays on PO# / TRK / ticket. Placeholder text when unbound / no platform.
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
  const typeOptions = typeClassifyOptions({
    catalogOptions: typeCatalog.options.map((o) => ({
      ...o,
      colorHex: typeColorOverrides.colors[o.value] ?? null,
    })),
  });

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
  const classifyFace = classifyCompact ? 'dot' : 'label';
  const openColorEdit = () => {
    setOpenPicker(null);
    setColorEditOpen(true);
  };
  const classifyCluster = showClassifyControls ? (
    <div
      ref={colorEditAnchorRef}
      data-testid="carton-context-classify-pills"
      className={cn(
        STATION_IDENTITY_GROUP_CLASS,
        'shrink-0',
        STATION_CHROME_SEAM_HAIRLINE,
      )}
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
        collapsedLabel={classifyCompact ? (platformOptions.find((o) => o.value === platformValue)?.shortLabel) : undefined}
        collapsedFace={classifyFace}
        presentation="menu"
        open={openPicker === 'platform'}
        onOpenChange={(o) => setClassifyMenu(o ? 'platform' : null)}
        disabled={classifyInteractive ? receivingId == null : false}
        readOnly={!classifyInteractive}
        placeholder={isUnmatched ? 'Unfound' : 'Platform'}
        onMenuEdit={classifyInteractive ? openColorEdit : undefined}
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
        onOpenChange={(o) => setClassifyMenu(o ? 'type' : null)}
        readOnly={!classifyInteractive}
        placeholder="Type"
        onMenuEdit={classifyInteractive ? openColorEdit : undefined}
      />
      {classifyInteractive ? (
        <>
          <span
            className="w-px shrink-0 self-stretch bg-border-hairline"
            aria-hidden
          />
          <HoverTooltip label="Edit colors" asChild>
            <IconButton
              size="sm"
              icon={<Pencil className="h-3.5 w-3.5" />}
              ariaLabel="Edit platform and type colors"
              aria-expanded={colorEditOpen}
              aria-haspopup="dialog"
              onClick={() => setColorEditOpen((o) => !o)}
              className="self-stretch hover:bg-surface-hover"
            />
          </HoverTooltip>
        </>
      ) : null}
      <ClassifyColorEditPopover
        open={colorEditOpen}
        onClose={() => setColorEditOpen(false)}
        anchorRef={colorEditAnchorRef}
      />
    </div>
  ) : null;


  /* PO# / order# — last-8 copy chip; edit menus stay on IdentityLinkChip when wired. */
  const orderChip = showOrderIdentity ? (
    onEditPo || onOrderDetails ? (
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
        editOpen={false}
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
    ) : (
      <OrderIdChip
        value={effectiveOrder}
        display={effectiveOrder ? getLast8(effectiveOrder) : resolveChipDisplay('')}
        dense
        displayWidth="last8"
        platformLabel={platformValue ? platformMeta.label : null}
        iconClass={platformIconTone?.className}
        iconStyle={platformIconTone?.style}
        truncateDisplay={false}
      />
    )
  ) : null;

  /* Tracking# — last-8 copy chip. Edit stays on IdentityLinkChip when wired. */
  const trackingSlot = isLocalPickup ? (
    <div className="flex h-full shrink-0 items-stretch border-l border-border-soft">
      <FulfillmentPickupPill
        variant="rail"
        tooltip="Fulfilled in person — no tracking number"
      />
    </div>
  ) : onEditTracking ? (
    <div className="flex h-full shrink-0 items-stretch border-l border-border-soft">
      <IdentityLinkChip
        openHref={trackingOpenHref}
        openTitle="Open carrier tracking"
        value={primaryTrackingTrimmed}
        display={
          primaryTrackingTrimmed ? getLast8(primaryTrackingTrimmed) : resolveChipDisplay('')
        }
        tone="tracking"
        carrierHint={carrierHint}
        showCarrierBrand
        lockLast8Width
        disableCopy={!primaryTrackingTrimmed}
        onEdit={onEditTracking}
        editOpen={false}
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
  ) : (
    <div className="flex h-full shrink-0 items-stretch border-l border-border-soft">
      <TrackingChip
        value={primaryTrackingTrimmed}
        display={
          primaryTrackingTrimmed ? getLast8(primaryTrackingTrimmed) : resolveChipDisplay('')
        }
        dense
        displayWidth="last8"
        carrierHint={carrierHint}
        truncateDisplay={false}
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

  const statusDot = lifecycle ? (
    <HoverTooltip label={lifecycle.tip || lifecycle.label} asChild>
      <span
        className={cn(STATION_CHROME_CELL_CLASS, STATION_CHROME_CELL_PAD)}
        data-testid="carton-context-lifecycle-dot"
        aria-label={lifecycle.label}
      >
        <span
          className={cn('h-2 w-2 shrink-0 rounded-full', lifecycle.dotClass)}
          aria-hidden
        />
      </span>
    </HoverTooltip>
  ) : null;

  const listingIconButton =
    showListing && !overflowSet.has('listing') ? (
      <HoverTooltip label={listingOpenTitle} asChild>
        <IconButton
          type="button"
          tone="neutral"
          size="sm"
          ariaLabel={listingOpenTitle}
          disabled={!listingHasTarget}
          onClick={() => {
            if (listingOpenHref) window.open(listingOpenHref, '_blank', 'noopener,noreferrer');
          }}
          icon={
            <span
              className={cn(
                listingHasTarget && platformIconTone
                  ? platformIconTone.className
                  : 'text-text-faint',
              )}
              style={listingHasTarget && platformIconTone ? platformIconTone.style : undefined}
            >
              <ExternalLink className={STATION_CHROME_GLYPH_CLASS} />
            </span>
          }
          className={STATION_CONTEXT_ACTION_CELL_CLASS}
          data-testid="carton-context-listing"
        />
      </HoverTooltip>
    ) : null;

  const claimIconButton =
    showStaffPhotoRow && !zendeskTrimmed && onMakeClaim && !overflowSet.has('claim') ? (
      <HoverTooltip label={claimViewActive ? 'Hide claim' : 'File claim'} asChild>
        <IconButton
          type="button"
          tone="neutral"
          size="sm"
          onClick={onMakeClaim}
          ariaLabel={claimViewActive ? 'Hide claim' : 'File claim'}
          aria-pressed={claimViewActive}
          icon={<Ticket className={cn(STATION_CHROME_GLYPH_CLASS, 'text-orange-600')} />}
          className={STATION_CONTEXT_ACTION_CELL_CLASS}
          data-testid="carton-context-claim"
        />
      </HoverTooltip>
    ) : null;

  const ticketInline =
    showStaffPhotoRow && zendeskTrimmed && !overflowSet.has('claim') ? (
      <div className={cn(STATION_CHROME_CELL_CLASS, 'border-l border-border-soft')}>
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

  const photosCell =
    showStaffPhotoRow && receivingId != null && !overflowSet.has('photos') ? (
      <ReceivingPhotoButton
        receivingId={receivingId}
        staffId={Number(staffId) || 0}
        poRef={effectiveOrder || null}
        photoStage={photoStage}
        appearance="chrome"
        galleryPlacement="left"
        onSendToTicket={onSendToTicket}
        onOpenMovePhotosExternal={onOpenMovePhotosExternal}
        onOpenPhotosDisplay={onOpenPhotosDisplay}
        suppressHoverGallery={suppressPhotoHoverGallery}
      />
    ) : null;

  const overflowItems: Array<{ key: string; label: string; onSelect: () => void }> = [];
  if (showListing && overflowSet.has('listing')) {
    overflowItems.push({
      key: 'listing-open',
      label: listingHasTarget ? `Open ${listingChipDisplay}` : 'Listing',
      onSelect: () => {
        if (listingOpenHref) window.open(listingOpenHref, '_blank', 'noopener,noreferrer');
      },
    });
    if (onEditListing) {
      overflowItems.push({
        key: 'listing-edit',
        label: 'Edit listing',
        onSelect: onEditListing,
      });
    }
  }
  if (showStaffPhotoRow && !zendeskTrimmed && onMakeClaim && overflowSet.has('claim')) {
    overflowItems.push({
      key: 'claim',
      label: claimViewActive ? 'Hide claim' : 'File claim',
      onSelect: onMakeClaim,
    });
  }
  if (showStaffPhotoRow && zendeskTrimmed && overflowSet.has('claim')) {
    overflowItems.push({
      key: 'ticket-open',
      label: `Open ticket ${zendeskChipDisplay}`,
      onSelect: () => {
        if (zendeskHref) window.open(zendeskHref, '_blank', 'noopener,noreferrer');
      },
    });
    if (onToggleTicketView && providerTicketId != null) {
      overflowItems.push({
        key: 'ticket-view',
        label: ticketViewActive ? 'Hide ticket editor' : 'Ticket history',
        onSelect: () => onToggleTicketView(),
      });
    }
  }
  if (showStaffPhotoRow && receivingId != null && overflowSet.has('photos')) {
    overflowItems.push({
      key: 'photos',
      label: 'Photos',
      onSelect: () => {
        if (onOpenPhotosDisplay) onOpenPhotosDisplay();
      },
    });
  }

  const overflowMenu =
    overflowItems.length > 0 ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            type="button"
            tone="neutral"
            size="sm"
            icon={<MoreHorizontal className={STATION_CHROME_GLYPH_CLASS} />}
            ariaLabel="More actions"
            className={STATION_CONTEXT_ACTION_CELL_CLASS}
            data-testid="carton-context-overflow"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-[12rem] border border-border-soft bg-surface-card text-text-default"
        >
          {overflowItems.map((item) => (
            <DropdownMenuItem key={item.key} onSelect={item.onSelect}>
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  const priceFace = showPoTotal ? (
    <span
      className={cn(
        STATION_CHROME_CELL_CLASS,
        STATION_CHROME_CELL_PAD,
        'gap-0.5 border-l border-border-soft font-mono text-role-caption tabular-nums text-text-muted',
      )}
      data-testid="carton-context-price"
    >
      <span className={CHIP_TONES.price.iconClass} aria-hidden>
        <Receipt className={STATION_CHROME_GLYPH_CLASS} />
      </span>
      {poTotal == null || !Number.isFinite(poTotal) ? '—' : poTotal.toFixed(2)}
    </span>
  ) : null;

  const oneRowBar = (
    <div
      ref={barRef}
      className={cn(
        'flex w-full min-w-0 flex-nowrap items-stretch overflow-hidden',
        STATION_CHROME_ROW_FACE,
        STATION_CHROME_SEAM_HAIRLINE,
      )}
      data-testid="carton-context-one-row"
    >
      {/* Left — identity (always visible) */}
      <div className="flex min-w-0 shrink-0 items-stretch border-r border-border-soft">
        {exitControl ? (
          <div className={STATION_IDENTITY_LEAD_COL_CLASS}>{exitControl}</div>
        ) : null}
        {statusDot}
        <div className="flex h-full min-w-0 shrink items-stretch [&_[data-chip-face]]:rounded-none">
          {orderChip}
          {trackingSlot}
          {qty ? (
            <div className={cn(STATION_CHROME_CELL_CLASS, 'border-l border-border-soft')}>
              <GridQtyFractionValue received={qty.received} expected={qty.expected} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Middle — classify (collapses first) */}
      {classifyCluster ? (
        <div className="flex min-w-0 flex-1 items-stretch justify-center overflow-hidden border-r border-border-soft">
          {classifyCluster}
        </div>
      ) : null}

      {/* Right — quiet price + icon actions; ⋯ before wrap */}
      <div className="flex shrink-0 items-stretch">
        {priceFace}
        {listingIconButton}
        {ticketInline ?? claimIconButton}
        {photosCell}
        {overflowMenu}
      </div>
    </div>
  );

  return <div className="w-full min-w-0 overflow-hidden">{oneRowBar}</div>;
}
