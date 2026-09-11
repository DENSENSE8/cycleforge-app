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
 *   Left — navigation: back, then identity flush against it (order# ·
 *            tracking#). No vertical rule between back and the first fact —
 *            the strip is one abutting row, same as Band-1 CTAs.
 *   Left — identity: order# · tracking#. **No lifecycle chip.** The stage is
 *            already on every row of the sidebar rail the operator selected
 *            this carton from, so a copy of it here spent bar width — on a
 *            strip under constant width pressure — restating what the surface
 *            beside it never stops showing. Removed 2026-08-21 after two passes
 *            (dot, then dot + word) failed to earn the space. The rail dot SoT
 *            (`getReceivingStatusDot`) is unchanged and still the one status
 *            face; this bar simply is not one of its consumers.
 *   Middle — classify: priority · platform · type, absolutely centered
 *            in the bar. Each wears its catalog identity dot + name. Collapses
 *            to dots only when those labels would touch identity or actions.
 *   Right — actions: quiet price · listing (ExternalLink + platform name)
 *            · claim (ticket + "Claim") · photos (camera + count). Listing,
 *            Claim, and photos share one word-button recipe
 *            (`STATION_CONTEXT_*_CHROME_CLASS`). Overflow is a raw `h-full`
 *            cell — never `IconButton` (fixed h-7 box floats off the strip).
 *            Those three verbs overflow into `⋯` before wrap.
 *
 * Secondary / exact triage detail (qty rollups, extra boxes, lineage,
 * exception routing, diagnostics) lives in right-edge **Displays** — never a
 * "Show details" expander under this identity band (guard:
 * `carton-context-details-in-displays.guard.test.ts`).
 *
 * The bar never wraps. Classify pills collapse and trailing verbs park in
 * `⋯` before a second row appears. No brand tiles. Never IconButton on this
 * row.
 * Omit optional props (`onMakeClaim`, `showStaffPhotoRow`, `showPoTotal`,
 * classify, …) to hide that affordance per station — do not invent empty
 * placeholder tracks.
 *
 * Thin adapters
 * (`LineCartonContextSection` · `TestingCartonHeader` ·
 * `ShippingEntityContextHeader` · `PackOrderIdentity` · `ReviewOrderIdentity` ·
 * `OrderStationIdentity`) wire domain controllers only. Pack photos use
 * `photosCell`; never a sibling control beside this card.
 *
 * Layout decisions preserved from the original inline implementation:
 *  - The listing chip uses a full-color brand tile ({@link PlatformMark}
 *    `preferBrandTile`) only when `tileSrc` exists (Amazon); other platforms
 *    show ExternalLink + label with no carton/FBA glyph. ExternalLink goes
 *    faint when there is no listing URL. Placeholder text when unbound.
 *  - Identity editing: listing/tracking editors accessible via chip edit actions,
 *    open external editing tabs. PO# is copy/open when linked; `onEditPo` opens
 *    Package Pairing → PO when there is no real Zoho PO id.
 *  - Every menu the bar opens is bottom-CENTER under its cell (classify · listing
 *    · photos) — one anchoring so the strip reads as one system. Overflow `⋯` is
 *    the one exception (`align=end`) so the trailing cell's menu stays on-screen.
 *    Collision flip is off on this bar. Catalog edit ("Edit colours" on the
 *    platform / type menus) opens ONE page-centered `CatalogManagerPopover` —
 *    never a second inline bar-anchored twin. Full Classify Displays stays the
 *    searchable editor when staff open that leaf themselves.
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
  draftTicketNumber,
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
  onOpenMovePhotosExternal,
  onOpenPhotosDisplay,
  suppressPhotoHoverGallery = false,
  photosCell = null,
}: {
  receivingId: number | null;
  staffId: string;
  isUnmatched: boolean;
  /**
   * Purchase-order money total, resolved by the adapter via `cartonPoTotal`
   * (`src/lib/receiving/po-total.ts`) — never summed in a view. `null` renders
   * a dash icon (no line on this carton carries a mirrored price).
   * Displayed under Photos (before listing · Claim, gap-0 abut) when {@link showPoTotal}.
   */
  poTotal?: number | null;
  /**
   * Show the PO-total / price slot. Default on — the top-right chrome always
   * paints price (honest `—` when unknown), listing, and photos.
   */
  showPoTotal?: boolean;
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
  /**
   * The DRAFT ticket number (`#12345`) while an unlinked carton has a claim
   * body typed but not filed. When set it TAKES the Claim slot — the operator
   * has already decided to claim, so the useful thing in that corner is the
   * number the ticket is heading for, not the verb they just used.
   * Predicted, never reserved — see `predictNextTicketNumber`.
   */
  draftTicketNumber?: string | null;
  /** True while the Unbox Claim push column is open — Claim pill reads pressed. */
  claimViewActive?: boolean;
  /** Photos + Claim row. Hidden in triage (unbox-only). */
  showStaffPhotoRow?: boolean;
  /**
   * Carton capture stage the header photo pill stamps (stage SoT) — required,
   * never defaulted (a defaulted safety classification is how bench photos
 * silently became arrival evidence;).
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
   * change). Scan-station adapters always pass the host closer that clears
   * that station's selection SoT (Unbox desk, Testing select-line, Pack /
   * Shipping controller). Omit only hides the control — never pass a no-op.
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
  /**
   * Station-owned Photos track (e.g. Pack send-to-phone). When set, occupies
   * the trailing photos slot instead of {@link ReceivingPhotoButton} — same
   * geometry as Unbox chrome; never a sibling beside this card. Omit on
   * receiving stations that use `receivingId` + `ReceivingPhotoButton`.
   */
  photosCell?: ReactNode;
}) {
  // One classify menu at a time — chip-anchored dropdown; identity band stays put.
  const [openPicker, setOpenPicker] = useState<'urgency' | 'platform' | 'type' | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const overflowAnchorRef = useRef<HTMLDivElement | null>(null);
  // Freeze the responsive decision while a classify menu is open. The row must
  // not reflow under a pointer that is mid-interaction: a pill changing width
  // moves out from under the cursor, which fires `mouseleave` and flashes the
  // menu shut. `openPicker` is exactly "a cell owns the pointer right now".
  const { classifyCompact, overflowActions } = useCartonContextBarLayout(
    barRef,
    openPicker != null,
  );
  const overflowSet = new Set<CartonContextActionId>(overflowActions);

  /**
   * Ownership-scoped: a pill may only clear the slot it actually holds.
   *
   * The pills share one hover registry, so crossing from one to the next evicts
   * the first and BOTH report — the loser "closed", the winner "opened" — in an
   * order React does not guarantee. A bare `setOpenPicker(null)` from the loser
   * landing last would clear the winner, unfreezing the bar's layout while its
   * menu is open: the reflow-under-a-stationary-pointer this row exists to
   * prevent. Keying the clear on `prev === picker` makes a stale close a no-op.
   */
  const setClassifyMenu = (
    picker: 'urgency' | 'platform' | 'type',
    next: boolean,
  ) => {
    if (next && !classifyInteractive) return;
    setOpenPicker((prev) => (next ? picker : prev === picker ? null : prev));
  };

  /**
   * "Edit" / "Edit colours" on the platform / type menus opens the org catalog
   * manager — the ONE place `platforms.color_hex` and the catalog rows are
   * edited ({@link CatalogManagerPopover} → {@link CatalogManagerList}, shared
   * with the /settings catalog section). It is a single PAGE-CENTERED overlay
   * (`RightPaneOverlay align="center"`): the carton bar used to also mount an
   * inline bar-anchored twin of the same list, so one job had two edit surfaces
   * with two anchorings. Urgency has no entry: it is `receiving.priority_tier`,
   * not a catalog row, so there is no colour to edit and a dead row would be
   * worse than its absence.
   */
  const [catalogManager, setCatalogManager] = useState<CatalogKind | null>(null);

  // Canonical platform tone/label for the listing chip — same SoT the platform
  // pill and printed label read, so a platform never presents two ways.
  // Org-editable platform/type catalogs drive the pickers below (fall back to
  // the built-in lists until seeded). The platform tone/label resolver reads
  // the catalog too, so a renamed or custom platform reads correctly here.
  const platformCatalog = usePlatformCatalog();
  const typeCatalog = useReceivingTypeCatalog();
  const platformTypeRules = usePlatformTypeRules();
  const priorityCatalog = usePriorityCatalog();
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
  /**
   * Type is a DEPENDENT picklist: platform controls which types are offered
   * (`platform_type_rules`). An unconstrained platform keeps the full list, so
   * this narrows nothing until an org authors a rule.
   *
   * The current value is always kept in the list even when a rule would now
   * forbid it. Rules are validated on WRITE, never on read — a carton filed
   * before the rule existed still shows what it actually is, instead of the
   * pill rendering blank on a value the row genuinely holds.
   */
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

  /**
   * One legal answer left AND the carton already says it → the pill is not a
   * question. Show it, do not ask. That is the ergonomic payoff of the
   * dependency: picking FBA files the carton as a Return without the operator
   * reaching for the type pill.
   *
   * The second half of that condition is load-bearing. A carton filed before
   * the rule existed can be sitting on a value the rule now forbids; locking
   * THAT pill would show the operator a wrong answer and take away the control
   * that fixes it. A rule may remove a choice — it must never strand a carton.
   */
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
  /**
   * Middle — the classifications an operator CHOOSES (priority · platform ·
   * type), absolutely centered. Status is not one of them: it is derived, so it
   * stays in the identity run with the facts it belongs to.
   *
   * Chip face — hover list. Platform / type Edit drops the catalog manager
   * under this centered cluster (middle display, not right overlay).
   */
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
        collapsedFace="dot"
        presentation="menu"
        open={openPicker === 'platform'}
        onOpenChange={(o) => setClassifyMenu('platform', o)}
        disabled={classifyInteractive ? receivingId == null : false}
        readOnly={!classifyInteractive}
        placeholder={isUnmatched ? 'Unfound' : 'Platform'}
        onEditCatalog={classifyInteractive ? () => setCatalogManager('platform') : undefined}
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


  /**
   * PO# / order# — ONE face for every scan station.
   *
   * There is no read-only twin. This used to branch on `onEditPo`: hosts that
   * wired an editor got {@link IdentityLinkChip}, everyone else got a bare
   * `OrderIdChip dense`. Two components for one job means the read-only station
   * (Arrival) drifts silently — which is exactly what happened to the tracking
   * cell below. Whether the menu carries an Edit row is a PROP, not a second
   * component.
   */
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
      editOpen={false}
      editLabel={
        poEditOpen
          ? 'Hide package pairing'
          : effectiveOrder
            ? 'Edit order'
            : 'Link PO'
      }
      actionsInMenu
    />
  ) : null;

  /**
   * Tracking# — ONE face for every scan station; Unbox is the SoT.
   *
   * The read-only branch used to paint a bare `TrackingChip dense`, which is a
   * PROPORTIONAL face inside the same `w-[8ch]` lock the mono face was measured
   * for. Eight digits did not fit, so Arrival truncated the number from the
   * wrong end — `052400…` instead of the last-8 the whole product identifies
   * cartons by. Same data, same lock, two type faces: the fork WAS the bug.
   *
   * Edit is a prop. A station that wires no editor simply gets a menu without
   * an Edit row.
   */
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
      onEdit={onEditListing}
      editLabel="Edit listing"
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

  // Photos stay on the bar even at 0 and even without a receiving id —
  // listing · price · photos are top-right chrome, never parked in ⋯.
  const emptyPhotosCell = (
    <button
      type="button"
      onClick={onOpenPhotosDisplay}
      disabled={!onOpenPhotosDisplay}
      className={STATION_CONTEXT_PHOTO_CHROME_CLASS}
      data-testid="carton-context-photos"
      aria-label="Photos"
    >
      <Camera className={STATION_CHROME_GLYPH_CLASS} aria-hidden />
      <span className="leading-none tabular-nums">0</span>
    </button>
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
            onOpenMovePhotosExternal={onOpenMovePhotosExternal}
            onOpenPhotosDisplay={onOpenPhotosDisplay}
            suppressHoverGallery={suppressPhotoHoverGallery}
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
      /**
       * Same panel as every other cell on this bar — the ⋯ differs only in
       * being CLICK-opened (there is no identity to peek at, so hover would be
       * a trap for a pointer crossing the bar). It was a Radix `DropdownMenu`;
       * the rows now come from the one row renderer.
       */
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

      {/* Left — identity (always visible) */}
      <div
        data-carton-bar-slot="identity"
        className="relative flex min-w-0 shrink-0 items-stretch gap-0"
      >
        {exitControl ? (
          <div className={STATION_IDENTITY_LEAD_COL_CLASS}>{exitControl}</div>
        ) : null}
        <div className="flex h-full min-w-0 shrink items-stretch [&_[data-chip-face]]:rounded-none">
          {/* Order # is a copy/menu target, so it gets the same cell box as
              every other interactive cell. The chip itself is `inline-flex` and
              centred — without this h-full wrapper its hover box would be
              shorter than the pills' and the strip would delineate at two
              heights. */}
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
