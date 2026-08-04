'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { ChevronLeft } from '@/components/Icons';
import { getLast8, PoTotalChip } from '@/components/ui/CopyChip';
import { GridQtyFractionValue } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button, IconButton } from '@/design-system/primitives';
import { ReceivingPhotoButton } from '@/components/receiving/workspace/line-edit/ReceivingPhotoButton';
import { IdentityLinkChip } from '@/components/receiving/workspace/line-edit/IdentityLinkChip';
import { ReceivingTicketChip } from '@/components/receiving/workspace/line-edit/ReceivingTicketChip';
import { FulfillmentPickupPill } from '@/components/receiving/ReceivingIdentityChips';
import {
  InlinePillPicker,
  INLINE_PILL_LEADING,
} from '@/components/receiving/workspace/line-edit/InlinePillPicker';
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
import { cn } from '@/utils/_cn';
import {
  HEADER_ICON_BTN_CLASS,
  TOP_CHROME_ICON_GLYPH,
} from '@/components/layout/header-shell';
import { STATION_CONTEXT_CLAIM_PILL_CLASS } from './station-context-action-pill';
import {
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
 *   Row 1 — *"what kind of work is this, and act on it"* — urgency · platform ·
 *           type, trailing listing · ticket/Claim · Photos.
 *   Row 2 — *"which record is this, how far along, and what is it worth"* —
 *           lifecycle dot · order#/PO# · tracking#, trailing the PO money total.
 *
 * The exit chevron opens row 1 so it and the order chip share the band's left
 * edge. Never mix an identifier into row 1 or a classification into row 2.
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
 *  - The listing chip face is the platform title (eBay / Amazon / …); gray
 *    `----` until a URL / derived storefront href exists. Platform tone stays
 *    on the icon/underline — unmatched cartons have no listing until a PO#
 *    binds them.
 *  - Identity editing: listing/tracking editors accessible via chip edit actions,
 *    open external editing tabs. PO# is copy/open when linked; `onEditPo` opens
 *    Package Pairing → PO when there is no real Zoho PO id.
 *  - Classify opens pills on the left only — right-side identity/actions are
 *    unchanged.
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
  onClassifyPillOpen,
  onMakeClaim,
  claimViewActive = false,
  showStaffPhotoRow = true,
  photoStage,
  listingLink,
  showListing = true,
  listingEditOpen = false,
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
}: {
  receivingId: number | null;
  staffId: string;
  isUnmatched: boolean;
  /**
   * Purchase-order money total, resolved by the adapter via `cartonPoTotal`
   * (`src/lib/receiving/po-total.ts`) — never summed in a view. `null` renders
   * the honest `—` (no line on this carton carries a mirrored price).
   * Displayed as row 2's trailing focal fact when {@link showPoTotal}.
   */
  poTotal?: number | null;
  /**
   * Show the PO-total slot at all. Off by default so a station whose active
   * entity is not a purchase order (Shipping / Pack / Review / Support order
   * identity) never grows a money column it cannot fill.
   */
  showPoTotal?: boolean;
  /**
   * Resolved lifecycle status dot for row 2's leading position — the SAME dot
   * the operator just clicked in the sidebar rail. Resolve via the receiving
   * rail SoT (`getReceivingStatusDot` / `getReceivingStatusDotLabel`,
   * `src/lib/receiving/rail/status.ts`); this card never maps a status itself.
   * Omit to hide.
   */
  lifecycle?: { dotClass: string; label: string } | null;
  /**
   * Carton-wide received / expected counts, resolved via `cartonQtyRollup`
   * (`src/lib/receiving/po-total.ts`) so this shares the PO total's carton
   * grain — never a per-line count beside a carton-wide total. Omit to hide.
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
   * Editing lives in triage Overview / Unbox Classify tab. Default true = Unbox
   * InlinePillPicker edit.
   */
  classifyInteractive?: boolean;
  /**
   * Fired when the operator opens a classify pill picker (Unbox). Lets the
   * host switch to the Classify tab for unfound cartons.
   */
  onClassifyPillOpen?: (picker: 'urgency' | 'platform' | 'type') => void;
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
  /** When true, pulses the listing chip to show edit is active. */
  listingEditOpen?: boolean;
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
   * Open Package Pairing → PO tab (link / import a Zoho PO). Pass when the
   * carton has no real Zoho PO id — empty `# ----` clicks this directly;
   * sales-order-linked chips keep copy + Edit in the hover menu.
   */
  onEditPo?: () => void;
  /** Pulse the PO chip while Package Pairing (PO) is open. */
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
}) {
  // Pills always visible when showClassifyControls — no hide/show toggle.
  // One picker open at a time. Opening any pill unrenders the trailing chip
  // cluster (the options fill the freed row); selecting / dismissing collapses
  // back to null and rerenders the chips. See the AnimatePresence swap below.
  const [openPicker, setOpenPicker] = useState<'urgency' | 'platform' | 'type' | null>(null);

  const openClassifyPicker = (picker: 'urgency' | 'platform' | 'type') => {
    if (!classifyInteractive) return;
    // Prefer host handoff (Unbox → Classify tab) over expanding the horizontal
    // marketplace pill strip in the bookmark header.
    if (onClassifyPillOpen) {
      onClassifyPillOpen(picker);
      return;
    }
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
  // Platform title on the listing face (eBay / Amazon / …). Identity last-8
  // stays on PO# / TRK / ticket; platform tone still drives icon/underline.
  const listingChipDisplay = isReturn
    ? platformValue
      ? platformMeta.label
      : 'Return'
    : listingHasTarget
      ? platformValue
        ? platformMeta.label
        : isUnmatched
          ? 'Unfound'
          : 'Listing'
      : '--------';
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

  // Exit chevron — leading column spanning both rows so row 1 and row 2 share
  // a left edge (one-row anatomy per row). `xs` matches
  // {@link STATION_IDENTITY_LEAD_COL_CLASS} (`w-6`) so the chevron and
  // lifecycle dot centre on one x — no `HEADER_ICON_WRAP` (that box is h-8).
  const exitControl = onExitToList ? (
    <HoverTooltip label={exitLabel} asChild>
      <IconButton
        type="button"
        size="xs"
        onClick={onExitToList}
        ariaLabel={exitLabel}
        icon={<ChevronLeft className={TOP_CHROME_ICON_GLYPH} />}
        className={cn(HEADER_ICON_BTN_CLASS, 'text-text-faint hover:text-text-muted')}
      />
    </HoverTooltip>
  ) : null;

  /* Classify bookmark — WIP dogfood: text-only full SoT names.
     Unbox/Triage click → Classify dimension (no icon faces).
     Stacked: this IS row 1's left side (the classification question). */
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
          expandedFace="iconLabel"
          open={false}
          onOpenChange={(o) => {
            if (o) openClassifyPicker('urgency');
          }}
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
        expandedFace="iconLabel"
        open={false}
        onOpenChange={(o) => {
          if (o) openClassifyPicker('platform');
        }}
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
        expandedFace="iconLabel"
        open={false}
        onOpenChange={(o) => {
          if (o) openClassifyPicker('type');
        }}
        readOnly={!classifyInteractive}
        placeholder="Type"
      />
    </div>
  ) : null;

  /* Listing / external open — ExternalLink + platform title (same CopyChip
     anatomy as PO# / tracking). Hover: Copy, then Edit. Stacked pins this to
     row 1's trailing slot. */
  const listingChip = showListing ? (
      <IdentityLinkChip
        openHref={listingOpenHref}
        openTitle={listingOpenTitle}
        linkOptions={listingLinkOptions}
        value={listingLink || listingOpenHref || ''}
        display={listingChipDisplay}
        // Platform tone ONLY when there's an actual listing to open.
        underlineClass={listingHasTarget && platformValue ? platformMeta.border : 'border-border-default'}
        iconClass={listingHasTarget && platformValue ? platformMeta.text : 'text-text-faint'}
        disableCopy={!(listingLink.trim() || listingOpenHref)}
        onEdit={onEditListing}
        editOpen={listingEditOpen}
        editLabel="Edit listing"
        actionsInMenu
        chipAction="open"
        menuFirstAction="copy"
        showExternalIcon
      />
  ) : null;

  /* PO# — or the originating ORDER# for a return: an imported RETURN shows its
     Zoho order#, and a serial-resolved return (scanned unit that was previously
     shipped) shows the closed-loop outbound order# lifted into this slot. Either
     way it's a copy chip SEPARATE from the listing link. Bound POs keep open +
     copy. Unfound / no real Zoho PO id may pass onEditPo → Package Pairing (PO
     tab); empty `# ----` clicks that directly. */
  const orderChip = showOrderIdentity ? (
    <IdentityLinkChip
      openHref={orderCopyOnly ? undefined : poOpenHref}
      openTitle={orderCopyOnly ? 'Order number' : 'Open PO in Zoho'}
      value={effectiveOrder}
      display={effectiveOrder ? getLast8(effectiveOrder) : '--------'}
      tone="id"
      underlineClass="border-border-emphasis"
      disableCopy={!effectiveOrder}
      onEdit={onEditPo}
      editOpen={poEditOpen}
      editLabel={poEditOpen ? 'Hide package pairing' : 'Link PO'}
      actionsInMenu
    />
  ) : null;

  /* Tracking# — tone `tracking` → MapPin. Chip click copies; hover menu opens
     carrier tracking or edits. Extra-box `+` sits on the chip (opens editor +
     adds a row). Suppressed for pickup. */
  const trackingSlot = isLocalPickup ? (
    <FulfillmentPickupPill
      variant="rail"
      tooltip="Fulfilled in person — no tracking number"
    />
  ) : (
    <div className="flex shrink-0 items-center gap-1">
      <IdentityLinkChip
        openHref={trackingOpenHref}
        openTitle="Open carrier tracking"
        value={primaryTrackingTrimmed}
        display={primaryTrackingTrimmed ? getLast8(primaryTrackingTrimmed) : '--------'}
        tone="tracking"
        underlineClass="border-blue-500"
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
          <span className="shrink-0 rounded bg-surface-strong/90 px-1 py-px text-role-eyebrow tabular-nums text-text-muted">
            +{filledExtraTrackingsCount}
          </span>
        </HoverTooltip>
      ) : null}
    </div>
  );

  /* Claim · Photos. Always shown with identity (classify does not collapse this
     side). Stacked pins it to row 2's trailing slot. */
  const actionsCluster = showStaffPhotoRow ? (
    <div className={cn(STATION_IDENTITY_ROW_CLASS, 'shrink-0')}>
      {zendeskTrimmed ? (
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
      ) : onMakeClaim ? (
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
      ) : null}

      {/* Photos — camera + count (or + when empty); hover opens gallery when photos exist. */}
      {receivingId != null ? (
        <ReceivingPhotoButton
          receivingId={receivingId}
          staffId={Number(staffId) || 0}
          poRef={effectiveOrder || null}
          photoStage={photoStage}
          onSendToTicket={onSendToTicket}
          onOpenMovePhotosExternal={onOpenMovePhotosExternal}
        />
      ) : null}
    </div>
  ) : null;

  // ── Two-row assembly (the only face) ───────────────────────────────────────
  // Both rows start at the SAME left edge — the exit chevron opens row 1 and
  // the order#/PO# chip sits directly beneath it, so the operator's eye lands
  // on "go back" and "which record" in one vertical sweep.
  //
  //   Row 1 — CONTEXT + the carton's work actions: classification pills, then
  //           listing link · ticket/Claim · Photos pinned right. Claim and
  //           Photos ride the top row because they are what the operator
  //           REACHES FOR, and the top row is the shorter travel from the
  //           section tabs below.
  //   Row 2 — IDENTIFIERS: order#/PO# · tracking#, closing on the PO money
  //           total at the right. The total is the row's focal fact — it
  //           answers "what is this box worth" right beside the ids that say
  //           which box it is.
  //
  // Never mix the two: no identifier on row 1, no classification on row 2.
  // Both rows open with the SAME leading gutter, so the exit chevron and the
  // lifecycle dot share a column and every following chip starts at one x.
  // Reserved whenever either row can fill it; dropped entirely when neither
  // can, so a station without both never pays 24px for an empty track.
  const hasLeadCol = !!exitControl || !!lifecycle;

  const stackedLayout = (
    <div className={cn(STATION_IDENTITY_ROW_STACK_CLASS, 'min-w-0 flex-1')}>
      {/* Row 1 — what kind of work is this, and act on it. */}
      <div className={cn(STATION_IDENTITY_ROW_CLASS, 'min-w-0')}>
        {hasLeadCol ? (
          <div className={STATION_IDENTITY_LEAD_COL_CLASS}>{exitControl}</div>
        ) : null}
        {classifyCluster}
        <div className={cn(STATION_IDENTITY_ROW_CLASS, 'ml-auto min-w-0 shrink')}>
          {listingChip}
          {actionsCluster}
        </div>
      </div>
      {/* Row 2 — which record is this, how far along, and what is it worth. */}
      <div className={cn(STATION_IDENTITY_ROW_CLASS, 'min-w-0')}>
        {hasLeadCol ? (
          <div className={STATION_IDENTITY_LEAD_COL_CLASS}>
            {/* House status-indicator anatomy (2-unit dot + HoverTooltip label,
                never a standalone text badge). `asChild` + `inline-block` per
                the `StatusChip` reference: the default HoverTooltip wrapper is
                an inline <span>, and an inline box drops `h-2 w-2` on the floor
                — the dot renders 0×0. */}
            {lifecycle ? (
              <HoverTooltip label={lifecycle.label} asChild>
                <span
                  className={cn('inline-block h-2 w-2 shrink-0 rounded-full', lifecycle.dotClass)}
                  data-testid="carton-context-lifecycle-dot"
                />
              </HoverTooltip>
            ) : null}
          </div>
        ) : null}
        <div className={cn(STATION_IDENTITY_ROW_CLASS, 'min-w-0 shrink')}>
          {orderChip}
          {trackingSlot}
          {qty ? (
            <GridQtyFractionValue received={qty.received} expected={qty.expected} />
          ) : null}
        </div>
        {showPoTotal ? (
          <div className={cn(STATION_IDENTITY_ROW_CLASS, 'ml-auto shrink-0')}>
            <PoTotalChip amount={poTotal} />
          </div>
        ) : null}
      </div>
    </div>
  );

  const body = (
      <div className="space-y-1 px-0.5 py-0">
        <div className="flex min-w-0 flex-col gap-y-1">
          {/* Two-row identity — row 1 classify · listing · Claim/Photos; row 2
              lifecycle · PO# · tracking · PO$. Classify pills hand off to the
              host Classify surface when `onClassifyPillOpen` is wired. */}
          <div className="flex w-full min-w-0 max-w-full items-center">
            <AnimatePresence initial={false}>
              {openPicker === null ? (
                <motion.div
                  key="bar"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
                  className="flex w-full max-w-full min-w-0 flex-nowrap items-center gap-2"
                >
                  {stackedLayout}
                </motion.div>
              ) : (
                <motion.div
                  key="picker"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
                  className="flex min-w-0 flex-1 items-center"
                >
                  {/* Right side unrendered — the chosen picker owns the row.
                      Selecting (or click-away / Escape) returns openPicker to
                      null, swapping the chip cluster back in.

                      NOTE: this branch is a ONE-row picker, so the stacked bar
                      sheds a row while it is open. Unreachable today —
                      `openClassifyPicker` bails before `setOpenPicker`
                      whenever `onClassifyPillOpen` is wired, and every
                      receiving-family host that shows classify pills wires it
                      (pills hand off to the Classify tab). A future host that
                      omits `onClassifyPillOpen` must give this branch the
                      two-row frame first. */}
                  {openPicker === 'urgency' ? (
                    <InlinePillPicker
                      ariaLabel="Urgency"
                      options={urgencyOptions}
                      value={urgencyValue}
                      onSelect={handleUrgencySelect}
                      open
                      onOpenChange={(o) => { if (!o) setOpenPicker(null); }}
                      expandedFace="iconLabel"
                      leadingIcon={INLINE_PILL_LEADING.urgency}
                    />
                  ) : openPicker === 'platform' ? (
                    <InlinePillPicker
                      ariaLabel="Platform"
                      options={platformOptions}
                      value={platformValue}
                      onSelect={onPlatformSelect}
                      open
                      onOpenChange={(o) => { if (!o) setOpenPicker(null); }}
                      expandedFace="iconLabel"
                      placeholder={isUnmatched ? 'Unfound' : 'Platform'}
                      leadingIcon={INLINE_PILL_LEADING.platform}
                    />
                  ) : (
                    <InlinePillPicker
                      ariaLabel="Type"
                      options={typeOptions}
                      value={receivingType}
                      onSelect={onTypeSelect}
                      open
                      onOpenChange={(o) => { if (!o) setOpenPicker(null); }}
                      expandedFace="iconLabel"
                      placeholder="Type"
                      leadingIcon={INLINE_PILL_LEADING.type}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
  );

  // Width comes from StationContextBar's identity Panel
  // ({@link STATION_WORKBENCH_IDENTITY_COLUMN}).
  return <div className="w-full min-w-0 overflow-visible">{body}</div>;
}