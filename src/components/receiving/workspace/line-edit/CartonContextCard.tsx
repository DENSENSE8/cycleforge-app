'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Barcode, ChevronLeft, ExternalLink, Plus, Reply, SlidersHorizontal, X } from '@/components/Icons';
import { getLast4 } from '@/components/ui/CopyChip';
import { SearchBar } from '@/components/ui/SearchBar';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { WorkspaceCard } from '@/design-system/components';
import { Button, IconButton } from '@/design-system/primitives';
import {
  RECEIVING_SCAN_RULE_LINE_CLASS,
  TRACKING_ADD_BTN_CLASS,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { WorkspaceFieldLabel } from '../WorkspaceSectionLabel';
import { ReceivingPhotoButton } from './ReceivingPhotoButton';
import { IdentityLinkChip } from './IdentityLinkChip';
import { ReceivingTicketChip } from './ReceivingTicketChip';
import { SellerMessageChip } from './SellerMessageChip';
import { FulfillmentPickupPill } from '@/components/receiving/ReceivingIdentityChips';
import { InlinePillPicker, type InlinePillOption } from './InlinePillPicker';
import { receivingPriorityRank, receivingPriorityTone } from './receiving-priority';
import { PRIORITY_OVERRIDE_TIERS, priorityOverrideTier } from '@/lib/receiving/priority-override';
import { usePlatformCatalog, useReceivingTypeCatalog, usePlatformMeta } from '@/hooks/useCatalog';
import {
  formatListingLinkMenuOptions,
  type CartonListingLink,
} from '@/lib/receiving/listing-links';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { cn } from '@/utils/_cn';
import { STATION_CONTEXT_CLAIM_PILL_CLASS } from './station-context-action-pill';


/**
 * Carton-level context card — **station entity-context header (SoT)**.
 *
 * Public import for all stations:
 *   `import { CartonContextCard } from '@/components/station/entity-context'`
 *
 * Staff dropdown + photo strip, the listing / Zendesk / PO# / tracking chip
 * row, the matching below-row inline editors, and the source-platform +
 * receiving-type pickers.
 *
 * DENSITY CONTRACT: this is an operations-heavy surface — everything stays on
 * ONE condensed row (pills + chips + actions), with editors sliding in below
 * on demand. Do not regroup it into stacked form sections; the one-row
 * anatomy is the display method. The card renders on the frosted glass
 * workspace surface (`WorkspaceCard variant="glass"`) shared by the whole
 * unbox column.
 *
 * Bar density (`density="bar"`): classify (left) · listing/PO/tracking · Claim/
 * Photos (right-justified clusters). Listing uses ExternalLink + platform mark
 * (same CopyChip anatomy as PO# / tracking). Utilities sit in the trough via
 * ReceivingStationContextBar.
 *
 * Layout decisions preserved from the original inline implementation:
 *  - The listing chip reads "----" (gray, no platform tone) until a URL or a
 *    derived storefront href exists (unmatched cartons have no listing until a
 *    PO# binds them).
 *  - All three identity editors (PO# / tracking / listing URL) live in the
 *    below-row drawer; the condensed top row stays chips + hover menus only.
 *
 * Purely presentational/controlled — all state lives in the parent.
 * Omit optional props (`onMakeClaim`, `showStaffPhotoRow`, `classifyPending`, …)
 * to hide that affordance for a given station adapter.
 */
export function CartonContextCard({
  receivingId,
  staffId,
  isUnmatched,
  classifyPending = false,
  showClassifyControls = true,
  onMakeClaim,
  showStaffPhotoRow = true,
  listingLink,
  setListingLink,
  showListing = true,
  listingEditorOpen,
  setListingEditorOpen,
  listingOpenHref,
  listingLinks = [],
  poOpenHref,
  trackingOpenHref,
  poDisplay,
  showOrderIdentity = true,
  poEditable = true,
  linkedOrderNumber = null,
  poEditorOpen,
  setPoEditorOpen,
  poNumberEdit,
  setPoNumberEdit,
  onCommitPoNumber,
  lineId,
  zendeskTrimmed,
  zendeskHref,
  zendeskChipDisplay,
  providerTicketId = null,
  onTicketUnlinked,
  primaryTrackingTrimmed,
  filledExtraTrackingsCount,
  isLocalPickup = false,
  trackingEditorsOpen,
  onToggleTrackingEditors,
  trackingEdit,
  setTrackingEdit,
  onCommitTracking,
  extraTrackings,
  setExtraTrackings,
  onCommitExtraTracking,
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
  density = 'card',
}: {
  receivingId: number | null;
  staffId: string;
  isUnmatched: boolean;
  /**
   * `card` — glass WorkspaceCard in the scroll body (legacy).
   * `bar` — flat inline row for the sticky station context trough (no card
   * chrome; listing = ExternalLink + platform mark, same CopyChip anatomy as
   * PO# / tracking).
   */
  density?: 'card' | 'bar';
  /**
   * The carton still needs its intake kind (unbox stepper's Classify dot is
   * active) — auto-expand the classify pills so this header IS the classify
   * surface, expanded. Set only for unclassified unfound cartons.
   */
  classifyPending?: boolean;
  /**
   * When false, hide the classify toggle + platform/type/urgency pills from
   * this header (triage moves them into the Overview SectionTabsSlider tab).
   */
  showClassifyControls?: boolean;
  /** Opens the claim modal. Omit (undefined) to hide the Claim button. */
  onMakeClaim?: () => void;
  /** Photos + Claim row. Hidden in triage (unbox-only). */
  showStaffPhotoRow?: boolean;
  listingLink: string;
  setListingLink: (v: string) => void;
  /** Hide the listing slot for stations whose active entity has no storefront listing. */
  showListing?: boolean;
  listingEditorOpen: boolean;
  setListingEditorOpen: Dispatch<SetStateAction<boolean>>;
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
  /** Disable the PO/identifier editor for read-only station adapters. */
  poEditable?: boolean;
  /**
   * Serial-resolved outbound (return) order#. Fills the PO#/order chip (last-4,
   * copy-only) ONLY when the carton has no PO# of its own — never clobbers a
   * bound PO#. This is the lifted LINKAGE identity (the standalone panel is gone).
   */
  linkedOrderNumber?: string | null;
  poEditorOpen: boolean;
  setPoEditorOpen: Dispatch<SetStateAction<boolean>>;
  poNumberEdit: string;
  setPoNumberEdit: (v: string) => void;
  /** Commit a typed/scanned PO# (parent decides whether it changed). */
  onCommitPoNumber: (raw: string) => void;
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
  trackingEditorsOpen: boolean;
  onToggleTrackingEditors: () => void;
  trackingEdit: string;
  setTrackingEdit: (v: string) => void;
  /** Commit a typed/scanned primary tracking# (parent decides if it changed). */
  onCommitTracking: (raw: string) => void;
  extraTrackings: string[];
  setExtraTrackings: Dispatch<SetStateAction<string[]>>;
  /**
   * Commit a typed/scanned EXTRA tracking# — attaches it to the carton's PO as
   * an additional box (POST /api/receiving/[id]/attach-box). Unlike the primary
   * tracking (which is the Zoho reference# anchor), extras link via the
   * receiving_shipments junction. docs/multi-tracking-po-plan.md Phase 1.
   */
  onCommitExtraTracking?: (raw: string, index: number) => void;
  platformValue: string;
  onPlatformSelect: (v: string) => void;
  receivingType: string;
  onTypeSelect: (v: string) => void;
  /** Manual priority-tier override (receiving.priority_tier): null = Auto, 0..3. */
  priorityTier?: number | null;
  /** Set/clear the priority tier (null = Auto). Omit to render urgency display-only. */
  onPrioritySelect?: (tier: number | null) => void;
  /**
   * Opt-in: toggle the inline support-ticket editor (`?ticketView=1`). Provided
   * only by the unbox `LineCartonContextSection` for v1 — omitting it hides the
   * reply-toggle button entirely (so the testing header shows nothing). The
   * button also requires a linked ticket (`zendeskTrimmed` + `providerTicketId`).
   */
  onToggleTicketView?: () => void;
  /** True while the inline ticket editor is open — drives aria-pressed + ring. */
  ticketViewActive?: boolean;
  /**
   * Far-left back button that closes the active entity so the right pane
   * crossfades back to this page's list/history display (in-page — NOT a route
   * change). Wire each adapter's existing close handler; omit to hide the button.
   */
  onExitToList?: () => void;
  /** Tooltip + aria-label for the back button. Default "Back to list". */
  exitLabel?: string;
}) {
  const listingRef = useRef<HTMLInputElement>(null);
  const poInputRef = useRef<HTMLInputElement>(null);

  const [classifyOpen, setClassifyOpen] = useState(classifyPending);

  // An unclassified unfound carton auto-expands the classify pills — this exact
  // header, expanded, IS the classify surface (no separate control). Opens the
  // moment classification is pending; never force-closes, so the operator can
  // still collapse back to the condensed one-row default after classifying.
  useEffect(() => {
    if (classifyPending) setClassifyOpen(true);
  }, [classifyPending]);

  // One picker open at a time. Opening any pill unrenders the trailing chip
  // cluster (the options fill the freed row); selecting / dismissing collapses
  // back to null and rerenders the chips. See the AnimatePresence swap below.
  const [openPicker, setOpenPicker] = useState<'urgency' | 'platform' | 'type' | null>(null);

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
  // an imported-return order#, the lifted linkage reads copy-only (last-4): it is
  // not a Zoho PO, so no Zoho open + no inline editor.
  const linkedReturnOrder = (linkedOrderNumber ?? '').trim();
  const effectiveOrder = poDisplay || linkedReturnOrder;
  const orderCopyOnly = isReturn || (!poDisplay && !!linkedReturnOrder);
  const listingHasTarget = !!(listingLink || listingOpenHref);
  const listingLinkOptions = formatListingLinkMenuOptions(listingLinks);
  const syncNoteListingLinks = listingLinks.filter((l) => l.source === 'sync_notes');
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
      : '----';
  // Bar density: short lettermark (Gw / eB) so listing matches PO#/TRK last-4 width.
  const listingBarDisplay = isReturn
    ? platformValue
      ? platformMeta.mark
      : 'Return'
    : listingHasTarget
      ? platformValue
        ? platformMeta.mark
        : isUnmatched
          ? 'Unfound'
          : 'Listing'
      : '----';

  // Urgency is a tier picker: Auto + Priority/High/Medium/Low. Collapsed it
  // shows the *effective* tier — the manual override when set, else the
  // platform-derived rank (so a no-override carton still reads its auto urgency
  // at rest). Open it offers Auto (clear → derived) + the four manual tiers.
  const derivedRank = receivingPriorityRank(isUnmatched, platformValue, false);
  const derivedTone = receivingPriorityTone(derivedRank);
  const overrideMeta = priorityOverrideTier(priorityTier);
  const urgencyValue = priorityTier != null ? String(priorityTier) : 'auto';
  const effectiveUrgencyLabel = overrideMeta ? overrideMeta.label : derivedTone.label;
  const effectiveUrgencyClass = overrideMeta
    ? overrideMeta.activeClass
    : `${derivedTone.className} border-transparent`;
  // In Auto mode the option matching the platform-derived urgency renders in
  // its active tone — the collapsed pill shows that derived label, so an open
  // picker highlighting only "Auto" read as if the current urgency were
  // unselected. Rank→tier mapping: Priority 0→0, unfound/untagged 1→High 1,
  // Amazon 2→High 1, eBay 3→Medium 2, Goodwill 4→Low 3; Other (9) highlights
  // nothing. Manual override set → normal value-match highlighting only.
  const RANK_TO_TIER: Record<number, number> = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 3 };
  const derivedTierEquivalent = priorityTier == null ? RANK_TO_TIER[derivedRank] ?? null : null;
  const urgencyOptions: InlinePillOption[] = [
    {
      value: 'auto',
      label: 'Auto',
      title: `Auto — follows platform (${derivedTone.label})`,
      activeClass: 'border-border-default bg-surface-card text-text-muted',
      inactiveClass:
        'border-border-soft bg-surface-card/70 text-text-soft hover:border-border-default hover:bg-surface-hover',
    },
    ...PRIORITY_OVERRIDE_TIERS.map((t) => ({
      value: String(t.value),
      label: t.label,
      title:
        derivedTierEquivalent === t.value
          ? `${t.title} — current (auto from platform); click to pin`
          : t.title,
      activeClass: t.activeClass,
      inactiveClass: derivedTierEquivalent === t.value ? t.activeClass : t.inactiveClass,
    })),
  ];
  const handleUrgencySelect = (v: string) =>
    onPrioritySelect?.(v === 'auto' ? null : Number(v));

  // All three identity editors now live in the below-row drawer — the condensed
  // top row is chips + pencils only.
  // The PO# editor is suppressed once the carton is an imported return — a
  // return is keyed by its order number (shown on the listing chip), not a PO.
  const anyBelow =
    (trackingEditorsOpen && !isLocalPickup) ||
    (showListing && listingEditorOpen) ||
    (poEditable && poEditorOpen && !isReturn);

  // Platform/Type pill options come straight from the org catalog (active rows,
  // org sort order) — so renames, hides, reorders, and custom entries the org
  // makes in the catalog manager all propagate here. Falls back to the built-in
  // lists until the catalog is seeded. The synthesized amber "Unfound" pill
  // leads the platform set for unmatched cartons (front-end only — never written
  // to source_platform).
  const platformOptions: InlinePillOption[] = [
    ...(isUnmatched
      ? [
          {
            value: '',
            label: 'Unfound',
            title: 'No Zoho PO matched this carton',
            activeClass: 'border-amber-600 bg-amber-500 text-white',
            inactiveClass:
              'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100',
          } as InlinePillOption,
        ]
      : []),
    ...platformCatalog.options.map((o) => ({ value: o.value, label: o.label })),
  ];
  const typeOptions: InlinePillOption[] = typeCatalog.options
    .filter((o) => o.value !== 'PICKUP')
    .map((o) => ({ value: o.value, label: o.label }));

  const body = (
      <div className={cn(density === 'bar' ? 'space-y-1 px-0 py-0' : 'space-y-2 px-4 pt-2 pb-3')}>
        <div className="flex min-w-0 flex-col gap-y-1">
          {/* Condensed identity row — Priority · Platform · Type · listing ·
              PO# · tracking# · Claim · Photos (in that order). Platform/Type
              collapse to the active pill and expand inline on click;
              listing/PO#/tracking are compact chips with hover Open/Edit menus.
              Priority/Claim/Photos are unbox-only (hidden in triage). */}
          <div className="flex min-w-0 items-center">
            <AnimatePresence mode="wait" initial={false}>
              {openPicker === null ? (
                <motion.div
                  key="bar"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className={cn(
                    'flex min-w-0 flex-1 items-center',
                    density === 'bar' ? 'flex-nowrap gap-2.5' : 'flex-wrap gap-2',
                  )}
                >
            {/* Cluster 1 — exit + classify (+ expanded urgency/platform/type). */}
            <div className="flex shrink-0 items-center gap-2">
            {/* Far-left — close the active entity and crossfade the right pane
                back to this page's list/history display (in-page, no navigation).
                Each adapter passes its mode's existing close handler. Unconditional
                (not gated by classify/photo props) so it stays the true leftmost
                element in triage/shipping too, where classify hides. */}
            {onExitToList ? (
              <HoverTooltip label={exitLabel} asChild>
                <IconButton
                  type="button"
                  size="md"
                  onClick={onExitToList}
                  ariaLabel={exitLabel}
                  icon={<ChevronLeft className="h-4 w-4" />}
                  className="shrink-0 rounded-lg text-text-faint hover:bg-surface-hover hover:text-text-muted"
                />
              </HoverTooltip>
            ) : null}
            {showClassifyControls && showStaffPhotoRow ? (
              <HoverTooltip label={classifyOpen ? 'Hide classification' : 'Show classification'} asChild>
                <button
                  type="button"
                  onClick={() => setClassifyOpen((v) => !v)}
                  aria-expanded={classifyOpen}
                  aria-pressed={classifyOpen}
                  aria-label={classifyOpen ? 'Hide classification' : 'Show classification'}
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    classifyOpen
                      ? 'bg-surface-sunken text-text-default'
                      : 'text-text-faint hover:bg-surface-hover hover:text-text-muted'
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </button>
              </HoverTooltip>
            ) : null}
            {showClassifyControls && classifyOpen ? (
              <>
            {showStaffPhotoRow ? (
              <InlinePillPicker
                ariaLabel="Urgency"
                options={urgencyOptions}
                value={urgencyValue}
                onSelect={handleUrgencySelect}
                collapsedLabel={effectiveUrgencyLabel}
                collapsedClass={effectiveUrgencyClass}
                open={false}
                onOpenChange={(o) => { if (o) setOpenPicker('urgency'); }}
                disabled={!onPrioritySelect}
              />
            ) : null}
            <InlinePillPicker
              ariaLabel="Platform"
              options={platformOptions}
              value={platformValue}
              onSelect={onPlatformSelect}
              open={false}
              onOpenChange={(o) => { if (o) setOpenPicker('platform'); }}
              disabled={receivingId == null}
              placeholder={isUnmatched ? 'Unfound' : 'Platform'}
            />
            <InlinePillPicker
              ariaLabel="Type"
              options={typeOptions}
              value={receivingType}
              onSelect={onTypeSelect}
              open={false}
              onOpenChange={(o) => { if (o) setOpenPicker('type'); }}
              placeholder="Type"
            />
              </>
            ) : null}
            </div>

            {/* Clusters 2–3 — identity facts · Claim/Photos (bar: justify end). */}
            <div
              className={cn(
                'flex min-w-0 items-center',
                density === 'bar'
                  ? 'ml-auto shrink-0 flex-nowrap justify-end gap-2.5'
                  : 'flex-wrap gap-2',
              )}
            >
            {/* Cluster 2 — listing · PO · tracking */}
            <div className="flex shrink-0 items-center gap-2">
            {/* Listing — bar: ExternalLink + platform mark (CopyChip anatomy).
                Card: icon-only PlatformMark. Hover menu offers Copy, then Edit. */}
            {showListing ? (
              density === 'bar' ? (
                <IdentityLinkChip
                  openHref={listingOpenHref}
                  openTitle="Open listing in new tab"
                  linkOptions={listingLinkOptions}
                  value={listingLink || listingOpenHref || ''}
                  display={listingBarDisplay}
                  // Platform tone ONLY when there's an actual listing to open.
                  underlineClass={listingHasTarget && platformValue ? platformMeta.border : 'border-border-default'}
                  iconClass={listingHasTarget && platformValue ? platformMeta.text : 'text-text-faint'}
                  disableCopy={!(listingLink.trim() || listingOpenHref)}
                  onEdit={() => {
                    setListingEditorOpen((v) => {
                      const next = !v;
                      if (next) queueMicrotask(() => listingRef.current?.focus());
                      return next;
                    });
                  }}
                  editOpen={listingEditorOpen}
                  editLabel="Edit listing URL"
                  actionsInMenu
                  chipAction="open"
                  menuFirstAction="copy"
                  showExternalIcon
                />
              ) : (
                <IdentityLinkChip
                  openHref={listingOpenHref}
                  openTitle="Open listing in new tab"
                  linkOptions={listingLinkOptions}
                  value={listingLink || listingOpenHref || ''}
                  display={listingChipDisplay}
                  iconOnly
                  iconOnlyMark={
                    <PlatformMark
                      platformValue={platformValue}
                      empty={!platformValue}
                      textClassName={
                        listingHasTarget && platformValue ? platformMeta.text : 'text-text-faint'
                      }
                      borderClassName={
                        listingHasTarget && platformValue ? platformMeta.border : undefined
                      }
                    />
                  }
                  underlineClass={listingHasTarget && platformValue ? platformMeta.border : 'border-border-default'}
                  iconClass={listingHasTarget && platformValue ? platformMeta.text : 'text-text-faint'}
                  disableCopy={!(listingLink.trim() || listingOpenHref)}
                  onEdit={() => {
                    setListingEditorOpen((v) => {
                      const next = !v;
                      if (next) queueMicrotask(() => listingRef.current?.focus());
                      return next;
                    });
                  }}
                  editOpen={listingEditorOpen}
                  editLabel="Edit listing URL"
                  actionsInMenu
                  chipAction="open"
                  menuFirstAction="copy"
                  showExternalIcon
                />
              )
            ) : null}

            {/* PO# — or the originating ORDER# for a return: an imported RETURN
                shows its Zoho order#, and a serial-resolved return (scanned unit
                that was previously shipped) shows the closed-loop outbound order#
                lifted into this slot. Either way it's a copy chip SEPARATE from
                the listing link, and — not being a Zoho PO — copy-only: no Zoho
                open, no inline editor. Normal bound POs keep open + edit.
                Tone `id` → # icon (open lives in hover menu). */}
            {showOrderIdentity ? (
              <IdentityLinkChip
                openHref={orderCopyOnly ? undefined : poOpenHref}
                openTitle={orderCopyOnly ? 'Order number' : 'Open PO in Zoho'}
                value={effectiveOrder}
                display={effectiveOrder ? getLast4(effectiveOrder) : '----'}
                tone="id"
                underlineClass="border-border-emphasis"
                disableCopy={!effectiveOrder}
                onEdit={
                  orderCopyOnly || !poEditable
                    ? undefined
                    : () => {
                        setPoEditorOpen((v) => {
                          const next = !v;
                          if (next) queueMicrotask(() => poInputRef.current?.focus());
                          return next;
                        });
                      }
                }
                editOpen={orderCopyOnly || !poEditable ? false : poEditorOpen}
                editLabel={orderCopyOnly || !poEditable ? undefined : 'Edit PO#'}
                actionsInMenu
              />
            ) : null}

            {/* Tracking# — tone `tracking` → MapPin. Chip click copies; hover
                menu opens carrier tracking or edits. Suppressed for pickup. */}
            <div className="flex shrink-0 items-center gap-1">
              {isLocalPickup ? (
                <FulfillmentPickupPill
                  variant="rail"
                  tooltip="Fulfilled in person — no tracking number"
                />
              ) : (
                <>
                  <IdentityLinkChip
                    openHref={trackingOpenHref}
                    openTitle="Open carrier tracking"
                    value={primaryTrackingTrimmed}
                    display={primaryTrackingTrimmed ? getLast4(primaryTrackingTrimmed) : '----'}
                    tone="tracking"
                    underlineClass="border-blue-500"
                    disableCopy={!primaryTrackingTrimmed}
                    onEdit={onToggleTrackingEditors}
                    editOpen={trackingEditorsOpen}
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
                </>
              )}
            </div>
            </div>

            {/* Cluster 3 — Claim · Photos */}
            {showStaffPhotoRow ? (
            <div className="flex shrink-0 items-center gap-2">
              {zendeskTrimmed ? (
                <div className="flex shrink-0 items-center gap-1">
                  <ReceivingTicketChip
                    value={zendeskTrimmed}
                    display={zendeskChipDisplay}
                    openHref={zendeskHref}
                    providerTicketId={providerTicketId}
                    receivingId={receivingId}
                    lineId={lineId}
                    onUnlinked={() => onTicketUnlinked?.()}
                  />
                  {/* Inline ticket editor toggle — opt-in per surface (unbox
                      only for v1). Requires a resolved provider ticket to reply
                      to; echoes the ticket chip's orange tone. */}
                  {onToggleTicketView && providerTicketId != null ? (
                    <HoverTooltip
                      label={ticketViewActive ? 'Close ticket editor' : 'Reply on this ticket'}
                      asChild
                    >
                      <IconButton
                        type="button"
                        onClick={onToggleTicketView}
                        ariaLabel={ticketViewActive ? 'Close ticket editor' : 'Reply on this ticket'}
                        aria-pressed={ticketViewActive}
                        icon={<Reply className="h-3.5 w-3.5 text-orange-600" />}
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-lg border shadow-sm ${
                          ticketViewActive
                            ? 'border-orange-300 bg-orange-100 ring-1 ring-inset ring-orange-400'
                            : 'border-orange-200 bg-orange-50 hover:border-orange-300 hover:bg-orange-100'
                        }`}
                      />
                    </HoverTooltip>
                  ) : null}
                  <SellerMessageChip
                    receivingId={receivingId}
                    lineId={lineId}
                    linkedTicketId={providerTicketId}
                  />
                </div>
              ) : onMakeClaim ? (
                <HoverTooltip label="File a damage / wrong-item / missing claim for this package" asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onMakeClaim}
                    ariaLabel="File claim"
                    className={STATION_CONTEXT_CLAIM_PILL_CLASS}
                  >
                    Claim
                  </Button>
                </HoverTooltip>
              ) : null}

            {/* Photos — camera + ×N + send-to-phone (+); hover opens gallery when photos exist. */}
            {receivingId != null ? (
              <ReceivingPhotoButton
                receivingId={receivingId}
                staffId={Number(staffId) || 0}
                poRef={effectiveOrder || null}
              />
            ) : null}
            </div>
            ) : null}
            </div>
                </motion.div>
              ) : (
                <motion.div
                  key="picker"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="flex min-w-0 flex-1 items-center"
                >
                  {/* Right side unrendered — the chosen picker owns the row.
                      Selecting (or click-away / Escape) returns openPicker to
                      null, swapping the chip cluster back in. */}
                  {openPicker === 'urgency' ? (
                    <InlinePillPicker
                      ariaLabel="Urgency"
                      options={urgencyOptions}
                      value={urgencyValue}
                      onSelect={handleUrgencySelect}
                      open
                      onOpenChange={(o) => { if (!o) setOpenPicker(null); }}
                    />
                  ) : openPicker === 'platform' ? (
                    <InlinePillPicker
                      ariaLabel="Platform"
                      options={platformOptions}
                      value={platformValue}
                      onSelect={onPlatformSelect}
                      open
                      onOpenChange={(o) => { if (!o) setOpenPicker(null); }}
                      placeholder={isUnmatched ? 'Unfound' : 'Platform'}
                    />
                  ) : (
                    <InlinePillPicker
                      ariaLabel="Type"
                      options={typeOptions}
                      value={receivingType}
                      onSelect={onTypeSelect}
                      open
                      onOpenChange={(o) => { if (!o) setOpenPicker(null); }}
                      placeholder="Type"
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Below-row inline editors for PO# / tracking / listing URL. */}
          {anyBelow ? (
            <div className="mt-2 space-y-2.5 border-t border-border-hairline pt-2">
              {poEditorOpen && !isReturn ? (
                <div className="relative">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <WorkspaceFieldLabel>PO number</WorkspaceFieldLabel>
                    <HoverTooltip label="Close editor" asChild>
                      <IconButton
                        type="button"
                        onClick={() => setPoEditorOpen(false)}
                        ariaLabel="Close PO# editor"
                        className="rounded p-0.5 text-red-500 hover:bg-red-50 hover:text-red-600"
                        icon={<X className="h-3.5 w-3.5" />}
                      />
                    </HoverTooltip>
                  </div>
                  <div className="group">
                    <SearchBar
                      value={poNumberEdit}
                      onChange={setPoNumberEdit}
                      onSearch={onCommitPoNumber}
                      inputRef={poInputRef}
                      placeholder="PO-1234"
                      variant="blue"
                      size="compact"
                      hideUnderline
                      pasteOnlyTrailing
                      className="w-full"
                    />
                    <div className={RECEIVING_SCAN_RULE_LINE_CLASS} aria-hidden />
                  </div>
                </div>
              ) : null}
              {trackingEditorsOpen && !isLocalPickup ? (
                <div className="relative">
                  <div className="flex items-start justify-between gap-2">
                    <WorkspaceFieldLabel>Tracking number</WorkspaceFieldLabel>
                    <span className="flex items-center gap-1">
                      <HoverTooltip
                        label={extraTrackings.length >= 1 ? 'Only one extra tracking row' : 'Add tracking number'}
                        asChild
                      >
                        <IconButton
                          type="button"
                          onClick={() => setExtraTrackings((xs) => (xs.length >= 1 ? xs : [...xs, '']))}
                          disabled={extraTrackings.length >= 1}
                          ariaLabel="Add second tracking number row"
                          className={TRACKING_ADD_BTN_CLASS}
                          icon={<Plus className="h-3 w-3" />}
                        />
                      </HoverTooltip>
                      <HoverTooltip label="Close editor" asChild>
                        <IconButton
                          type="button"
                          onClick={onToggleTrackingEditors}
                          ariaLabel="Close tracking editor"
                          className="rounded p-0.5 text-red-500 hover:bg-red-50 hover:text-red-600"
                          icon={<X className="h-3.5 w-3.5" />}
                        />
                      </HoverTooltip>
                    </span>
                  </div>
                  <div className="group min-w-0">
                    <SearchBar
                      value={trackingEdit}
                      onChange={setTrackingEdit}
                      onSearch={onCommitTracking}
                      placeholder="Tracking"
                      variant="blue"
                      size="compact"
                      hideUnderline
                      pasteOnlyTrailing
                      leadingIcon={<Barcode className="h-[14px] w-[14px]" />}
                      className="w-full min-w-0"
                    />
                    <div className={RECEIVING_SCAN_RULE_LINE_CLASS} aria-hidden />
                  </div>
                  {extraTrackings.map((t, i) => (
                    <div key={i} className="group min-w-0">
                      <SearchBar
                        value={t}
                        onChange={(v) => setExtraTrackings((xs) => xs.map((x, j) => (j === i ? v : x)))}
                        onSearch={(v) => onCommitExtraTracking?.(v, i)}
                        placeholder="Tracking"
                        variant="blue"
                        size="compact"
                        hideUnderline
                        debounceMs={0}
                        pasteOnlyTrailing
                        leadingIcon={<Barcode className="h-[14px] w-[14px]" />}
                        className="w-full min-w-0"
                      />
                      <div className={RECEIVING_SCAN_RULE_LINE_CLASS} aria-hidden />
                    </div>
                  ))}
                </div>
              ) : null}
              {listingEditorOpen ? (
                <div className="relative">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <WorkspaceFieldLabel>Listing URL</WorkspaceFieldLabel>
                    <HoverTooltip label="Close editor" asChild>
                      <IconButton
                        type="button"
                        onClick={() => setListingEditorOpen(false)}
                        ariaLabel="Close listing editor"
                        className="rounded p-0.5 text-red-500 hover:bg-red-50 hover:text-red-600"
                        icon={<X className="h-3.5 w-3.5" />}
                      />
                    </HoverTooltip>
                  </div>
                  <div className="space-y-2">
                    <div className="group">
                      <SearchBar
                        value={listingLink}
                        onChange={setListingLink}
                        onClear={() => setListingLink('')}
                        inputRef={listingRef}
                        placeholder="Manual override URL"
                        variant="blue"
                        size="compact"
                        hideUnderline
                        leadingIcon={
                          <HoverTooltip label={listingOpenHref ? 'Open primary link' : 'Enter a valid URL'} asChild>
                            <IconButton
                              type="button"
                              tone="accent"
                              onClick={(e) => {
                                e.preventDefault();
                                if (listingOpenHref) {
                                  window.open(listingOpenHref, '_blank', 'noopener,noreferrer');
                                }
                              }}
                              disabled={listingOpenHref == null}
                              ariaLabel="Open primary listing URL in new tab"
                              className="-m-0.5 rounded p-0.5 text-blue-600 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-text-faint disabled:opacity-60"
                              icon={<ExternalLink className="h-[14px] w-[14px]" />}
                            />
                          </HoverTooltip>
                        }
                        className="w-full"
                      />
                      <div className={RECEIVING_SCAN_RULE_LINE_CLASS} aria-hidden />
                    </div>

                    {syncNoteListingLinks.length > 0 ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <WorkspaceFieldLabel>Synced listing links</WorkspaceFieldLabel>
                          <HoverTooltip label="Scroll to Zoho Notes editor (to edit the synced list)" asChild>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const el = document.getElementById('zoho-notes-card');
                                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }}
                            >
                              Edit Zoho notes
                            </Button>
                          </HoverTooltip>
                        </div>
                        <div className="space-y-1">
                          {syncNoteListingLinks.map((l, i) => (
                            <button
                              key={`${l.href}-${i}`}
                              type="button"
                              onClick={() => window.open(l.href, '_blank', 'noopener,noreferrer')}
                              className="flex w-full items-center justify-between gap-2 rounded-md border border-border-hairline bg-surface-card/70 px-2 py-1.5 text-left text-role-caption font-semibold text-text-muted transition hover:bg-surface-hover"
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {(l.label || '').trim() || `Listing ${i + 1}/${syncNoteListingLinks.length}`}
                              </span>
                              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
  );

  if (density === 'bar') {
    return <div className="min-w-0 flex-1 overflow-visible">{body}</div>;
  }

  return (
    <WorkspaceCard variant="glass" bodyClassName="px-0 py-0" overflow="visible">
      {body}
    </WorkspaceCard>
  );
}
