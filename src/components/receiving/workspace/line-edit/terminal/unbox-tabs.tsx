'use client';

import type { ReactNode } from 'react';
import { CartonUnitsRollupBody } from '../../CartonUnitsRollup';
import { UnboxLabelPreview } from '../UnboxLabelPreview';
import { CartonMatchHub } from '../CartonMatchHub';
import { POUnboxingSection } from '../POUnboxingSection';
import { UnboxProcedureChecklist } from '../UnboxProcedureChecklist';
import { LinePoNoteCard } from '../LinePoNoteCard';
import { SupportContextHub } from '@/components/support/context';
import { SectionTabsSlider, WorkspaceCard, type SectionTab } from '@/design-system/components';
import { buildSectionTabs, WorkspaceTimelineTab } from '@/components/station/workbench';
import { Barcode, ClipboardList, ExternalLink, FileText, History, Link2, MapPin, MessageSquare, SlidersHorizontal } from '@/components/Icons';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { InlineActionFeedbackPayload } from '../../InlineActionFeedbackCard';
import type { PoNoteTabState } from './usePoNoteTabState';
import type { UnboxSideTab } from '../unbox-side-tabs';
import { TrackingNumbersTab } from '../TrackingNumbersTab';
import { ListingLinksTab } from '../ListingLinksTab';
import { TriageClassifySection } from '@/components/receiving/triage/TriageClassifySection';
import { providerCatalogLabel } from '@/lib/integrations/capability-labels';

/** Compact strip label from the Integrations provider catalog (SoT). */
function providerStripLabel(providerKey: string): string {
  const full = providerCatalogLabel(providerKey);
  // Tab strip wants the brand token ("Zoho Inventory" → "Zoho").
  const brand = full.split(/\s+/)[0]?.trim();
  return brand || full;
}

/**
 * Controller is the full `useUnboxLineController` return. Typed as unknown at
 * the boundary so this module doesn't import the heavy controller type; the
 * call site in LineEditPanel passes `c` directly.
 */
export interface BuildUnboxTabsInput {
  row: ReceivingLineRow;
  staffId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- unbox controller return
  c: any;
  /** Which side tab is showing — gates the lazily-mounted Support hub. */
  activeSideTab: UnboxSideTab | null;
  hasUnits: boolean;
  serialCount: number;
  hasTimelineTab: boolean;
  hasTrackingTab: boolean;
  hasListingsTab: boolean;
  /** Always true — Classify is the SoT editor (strip for unfound, overflow for matched). */
  hasClassifyTab: boolean;
  /** Unfound: Classify stays on the strip after Pairing. Matched: under ⋯. */
  classifyOnStrip: boolean;
  /** Package Pairing needs a carton record to pair against. */
  hasPairingTab: boolean;
  poIdForTracking: string;
  hasPoNoteTab: boolean;
  poNote: PoNoteTabState;
  /** Header classify pill → open this dimension in TriageClassifySection. */
  classifyExpandDimension?: 'urgency' | 'platform' | 'type' | null;
  /** Bump to re-open the same dimension from the header. */
  classifyExpandRequestId?: number;
  /**
   * Carton `# ----` handoff — which pairing tab the display opens on.
   *
   * A PROP, not the window event this used to be: the display opens via
   * `router.replace`, so `CartonMatchHub` mounts a navigation after the click
   * and any dispatch — even one deferred a frame — lands before it subscribes.
   */
  pairingFocusTab?: 'zoho_po' | null;
  /** Bump to re-select the PO tab when pairing is already showing. */
  pairingFocusRequestId?: number;
  onItemDescFeedback?: (feedback: InlineActionFeedbackPayload | null) => void;
  onItemDescSaved?: (lineId: number, zohoNotes: string | null) => void;
  /** Carton-open snapshot of `receiving.accordionExpand`. */
  accordionBootstrap?: 'default' | 'all';
}

/**
 * The Unbox CENTRE — PO lines (condition + serial) → label preview.
 *
 * No tab strip above it: `overview` is the whole workbench body, and every other
 * display lives in the right-edge Displays push column ({@link buildUnboxSideTabs}).
 *
 * The guided ProcedureDeck / step dock continues on the `unbox-work` lane
 * (`../cycleforge-unbox`); main dogfood ships this PO-line centre instead.
 */
export function buildUnboxOverview(
  input: Pick<
    BuildUnboxTabsInput,
    | 'row'
    | 'staffId'
    | 'c'
    | 'onItemDescFeedback'
    | 'onItemDescSaved'
    | 'accordionBootstrap'
  >,
): ReactNode {
  const {
    row,
    staffId,
    c,
    onItemDescFeedback,
    onItemDescSaved,
    accordionBootstrap = 'default',
  } = input;

  return (
    <div className="space-y-4">
      <POUnboxingSection
        row={row}
        staffId={staffId}
        poItems
        matching
        openInUnbox={false}
        editLines
        serialScan
        c={c}
        suppressItemsHeader
        onItemDescFeedback={onItemDescFeedback}
        onItemDescSaved={onItemDescSaved}
        accordionBootstrap={accordionBootstrap}
      />
      <UnboxLabelPreview row={row} c={c} />
    </div>
  );
}

/**
 * Build the Unbox side displays for the Displays push column.
 *
 * Visibility gates stay here so the strip and {@link resolveUnboxSideTab} agree
 * on what exists. Filters through {@link buildSectionTabs} — the shared waist for
 * all stations.
 *
 * Each tab owns its own actions now: the bottom dock is carton-terminal
 * (Print · Receive) and no longer changes with the selected display, so a
 * tab-scoped action (Save the PO note, Check all, Prebox, post a reply) is a
 * LOCAL control inside its own body. Ticket is not a display — it opens as
 * `ReceivingTicketStack`, a peer push column.
 */
export function buildUnboxSideTabs(input: BuildUnboxTabsInput): SectionTab[] {
  const {
    row,
    staffId,
    c,
    activeSideTab,
    hasUnits,
    serialCount,
    hasTimelineTab,
    hasTrackingTab,
    hasListingsTab,
    hasClassifyTab,
    classifyOnStrip,
    hasPairingTab,
    poIdForTracking,
    hasPoNoteTab,
    poNote,
    classifyExpandDimension = null,
    classifyExpandRequestId = 0,
    pairingFocusTab = null,
    pairingFocusRequestId = 0,
  } = input;

  return buildSectionTabs([
    {
      id: 'pairing',
      label: 'Pairing',
      icon: Link2,
      visible: hasPairingTab,
      // Package Pairing is a DISPLAY, not a peer push column: it is
      // reference-and-edit work the operator chooses to look at, never an
      // exception that interrupts them. It rendered inline in the `contents`
      // step until 2026-08-02, while its only toggle sat on this edge — so a
      // click on the right changed something off-screen in the centre.
      //
      // Bare chrome on Unbox Displays: the strip cell already says "Pairing",
      // so the hub drops the duplicate parent title + pencil and uses a
      // secondary dropdown (Auto-match + Pairing). Selected-ness IS open.
      content: (
        <CartonMatchHub
          row={row}
          staffId={staffId}
          tabSet="unbox"
          chrome="bare"
          showOpenInUnbox={false}
          // Already in unbox, and the wedge owns focus at a bench — a display
          // opening must not move the caret into a search box.
          autoFocusSearch={false}
          focusTab={pairingFocusTab}
          focusRequestId={pairingFocusRequestId}
          autoMatch={
            c.isUnfound
              ? {
                  receivingId: row.receiving_id ?? null,
                  lineId: row.id ?? null,
                  trackingNumber: row.tracking_number ?? null,
                  receivedSerial: row.serials?.[0]?.serial_number ?? null,
                  providerTicketId: c.providerTicketId,
                  ticketNumber: c.supportTicket?.label ?? null,
                  ticketUrl: c.supportTicket?.openUrl ?? null,
                  onTicketChanged: () => void c.invalidateSupportTicket(),
                }
              : null
          }
        />
      ),
    },
    {
      id: 'classify',
      label: 'Classify',
      icon: SlidersHorizontal,
      visible: hasClassifyTab,
      priority: classifyOnStrip ? 'primary' : 'overflow',
      content: (
        <TriageClassifySection
          row={row}
          c={c}
          expandDimension={classifyExpandDimension}
          expandRequestId={classifyExpandRequestId}
        />
      ),
    },
    {
      id: 'listings',
      label: 'Listings',
      icon: ExternalLink,
      visible: hasListingsTab,
      content: (
        <ListingLinksTab
          listingLinks={c.listingLinks ?? []}
          listingLink={c.listingLink}
          setListingLink={c.setListingLink}
        />
      ),
    },
    {
      id: 'units',
      label: 'Units',
      icon: Barcode,
      count: serialCount,
      visible: hasUnits,
      content: (
        <WorkspaceCard variant="glass" overflow="visible" bodyDensity="nested">
          <div className="space-y-3">
            <CartonUnitsRollupBody
              receivingId={row.receiving_id ?? null}
              activeLineId={row.id ?? null}
              showEmpty
              showPreboxAction
            />
          </div>
        </WorkspaceCard>
      ),
    },
    {
      id: 'po-note',
      label: providerStripLabel('zoho'),
      icon: FileText,
      visible: hasPoNoteTab,
      content: (
        <LinePoNoteCard
          draft={poNote.draft}
          onDraftChange={poNote.setDraft}
          loading={poNote.loading}
          dirty={poNote.dirty}
          saving={poNote.saving}
          onSave={() => void poNote.save()}
          onSyncFromInventory={() => void poNote.syncFromInventory()}
        />
      ),
    },
    {
      id: 'checklist',
      label: 'Checklist',
      icon: ClipboardList,
      stripHidden: true,
      // Ring-only optional status — not a twin of a centre ProcedureDeck on main.
      // Derives from the same procedure vocabulary; centre work is PO lines + label.
      content: (
        <WorkspaceCard variant="glass" overflow="visible" bodyDensity="nested">
          <UnboxProcedureChecklist row={row} />
        </WorkspaceCard>
      ),
    },
    {
      id: 'support',
      label: 'Support',
      icon: MessageSquare,
      priority: 'overflow',
      content:
        activeSideTab === 'support' && (row.id != null || row.receiving_id != null) ? (
          <div className="flex h-[68vh] min-h-[460px] flex-col overflow-hidden">
            <SupportContextHub
              anchor={{
                receivingId: row.receiving_id ?? null,
                lineId: row.id ?? null,
                tracking: row.tracking_number ?? null,
              }}
              variant="station"
              defaultSegment="team"
              hideCustomerSegment
              hideLinkage
              // No `externalSubmit`: the composer owns its own Send / Add note
              // now that the bottom dock is carton-terminal. That was the whole
              // job of the deleted support bridge.
              className="h-full min-h-0 rounded-2xl"
            />
          </div>
        ) : null,
    },
    {
      id: 'tracking',
      label: 'Tracking',
      icon: MapPin,
      priority: 'overflow',
      visible: hasTrackingTab,
      content: (
        <TrackingNumbersTab
          trackingEdit={c.trackingEdit}
          setTrackingEdit={c.setTrackingEdit}
          onCommitTracking={(v) => {
            const trimmed = v.trim();
            if (trimmed !== (row.tracking_number || '').trim()) {
              c.patch({ zoho_reference_number: trimmed || null });
            }
          }}
          extraTrackings={c.extraTrackings}
          setExtraTrackings={c.setExtraTrackings}
          onCommitExtraTracking={(v, i) => void c.attachExtraBox(v, i)}
          primaryTrackingTrimmed={c.primaryTrackingTrimmed}
        />
      ),
    },
    {
      id: 'timeline',
      label: 'Timeline',
      icon: History,
      priority: 'overflow',
      visible: hasTimelineTab,
      content: (
        <WorkspaceTimelineTab
          poId={poIdForTracking || null}
          tracking={row.tracking_number ?? null}
          receivingId={row.receiving_id ?? null}
        />
      ),
    },
  ]);
}

export function UnboxSectionTabs({
  tabs,
  value,
  onChange,
  rightSlot,
  headerClassName,
  compact = false,
}: {
  tabs: SectionTab[];
  value: string;
  onChange: (id: string) => void;
  /** Right cluster: vertical ⋮ peer · flat pencil (pencil rightmost). */
  rightSlot?: ReactNode;
  /** Optional strip-row class (legacy clearance for a pane-anchored ring — unused on Unbox). */
  headerClassName?: string;
  /** Tighter icon row — Unbox Displays under the pane ring. */
  compact?: boolean;
}) {
  return (
    <SectionTabsSlider
      tabs={tabs}
      value={value}
      onChange={onChange}
      ariaLabel="Unbox displays"
      rightSlot={rightSlot}
      headerClassName={headerClassName}
      compact={compact}
      // Quiet icon row: idle cells are icon-only (label = tooltip + accessible
      // name), the selected cell expands to icon + label. The switcher is
      // chrome for a 360px push column — it must not out-shout the display it
      // selects, which a bordered rail with a saturated accent pill did.
      density="icon"
    />
  );
}
