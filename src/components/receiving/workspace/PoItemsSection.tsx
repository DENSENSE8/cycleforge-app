'use client';

/**
 * The ONE PO-items surface. Every station that lists a carton's items renders
 * this: Unbox and Triage (`LinePoItemsSection`), Testing
 * (`TestingPoItemsSection`), and `/search` (`SearchReceivingPoItems`).
 *
 * ## What was actually duplicated
 *
 * Not the rows — those already went through {@link PoLinesAccordion} /
 * {@link UnmatchedItemsSection}. What each station carried its own copy of was
 * the **lane decision**: whether this carton's items belong on the matched Zoho
 * accordion or the unfound surface. Three copies, and they had already drifted:
 *
 *  - Unbox and `/search` probed the siblings list so a REAL PO carton whose
 *    lines have not landed yet (`linelessRealPo`) falls back to the unfound
 *    surface instead of painting an empty accordion.
 *  - **Testing did not probe at all**, so the same carton read as "no items"
 *    there while the other two stations offered the add / pair path. A carton
 *    the operator could work on Unbox was a dead end on Testing, and nothing
 *    about either file said the two disagreed.
 *
 * The probe reuses `receivingSiblingsQueryKey` — the same key the accordion's
 * own `usePoLinesData` reads — so deciding the lane costs no extra request.
 *
 * ## What is NOT shared, and why the props look like this
 *
 * `PoItemsSectionProps` extends {@link UnmatchedItemsSectionProps} because that
 * interface is already the superset: every chrome knob (embedded · headerRight ·
 * suppressHeader · readOnly · unitsChrome · hideNoTestLines · lineCollapse ·
 * activeRowSlot · …) is shared by both lanes, and the handful of unfound-only
 * members (the waiver bundle, `onLinked`, `onOpenInUnbox`) are optional and
 * simply unread on the matched lane. Four accordion-only props are added here.
 *
 * A station's CONTROLLER stays its own — the Unbox capture leaf, Testing's
 * verdict wiring, `/search`'s read-only stance. That is behaviour, and it comes
 * in through the slots. Only the routing is law.
 */

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PoLinesAccordion } from './PoLinesAccordion';
import { UnmatchedItemsSection } from './UnmatchedItemsSection';
import type { UnmatchedItemsSectionProps } from './unmatched-items/unmatched-items-shared';
import type { PoLineSerialSplitContext } from './PoLineTitleMenu';
import type {
  ActiveRowSlot,
  PoLineSerialActions,
} from './po-lines-accordion-types';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { receivingSiblingsQueryKey } from '@/lib/queries/receiving-queries';
import {
  shouldUsePoAccordion,
  shouldUseUnmatchedItemsSurface,
} from '@/lib/receiving/intake-items-routing';

interface SiblingsResponse {
  success: boolean;
  receiving_lines: unknown[];
}

export type PoItemsLane = 'accordion' | 'unmatched';

/**
 * Which surface this carton's items belong on.
 *
 * Exported so a host that has to know BEFORE render (a header CTA, a seed) can
 * ask the same question the section answers, rather than re-deriving it.
 */
export function usePoItemsLane(
  row: ReceivingLineRow,
  receivingId: number,
): PoItemsLane {
  const wantsPoAccordion = shouldUsePoAccordion(row);

  // Same key as the accordion's own siblings read — cache-shared, not a second
  // request. `enabled` keeps it off entirely for cartons already known unfound.
  const { data, isPending } = useQuery<SiblingsResponse>({
    queryKey: receivingSiblingsQueryKey(receivingId),
    queryFn: async () => {
      const res = await fetch(
        `/api/receiving-lines?receiving_id=${receivingId}&include=serials`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error('Failed to fetch receiving lines');
      return res.json();
    },
    enabled: wantsPoAccordion,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const siblingCount = data?.receiving_lines?.length;
  // Undefined while in flight — never call it lineless mid-fetch, or the lane
  // flips to unfound for one paint and back.
  const linelessRealPo =
    wantsPoAccordion &&
    !isPending &&
    (siblingCount === undefined ? false : siblingCount === 0);

  return shouldUseUnmatchedItemsSurface(row) || linelessRealPo
    ? 'unmatched'
    : 'accordion';
}

export interface PoItemsSectionProps extends UnmatchedItemsSectionProps {
  /**
   * The controller-active line. Decides the lane, seeds the cold-open
   * placeholder, and supplies the default `activeLineId`.
   */
  row: ReceivingLineRow;
  /**
   * Capture body under each line — **matched lane only**, and deliberately not
   * forwarded to the unfound surface.
   *
   * The unfound lane runs its own serial CRUD (`useUnmatchedItems` inside
   * `UnmatchedAccordionSurface`), because an unfound carton's writes attach
   * differently from a PO line's. Handing it a host's capture leaf — which is
   * bound to that host's controller — would silently move those writes onto the
   * wrong path. The surface keeps its own override hatch for a caller that
   * genuinely wants it; this section does not spend one on a case nobody has.
   */
  activeRowSlot?: ActiveRowSlot;
  /** Header serial chip actions — matched lane only, same reason as above. */
  activeSerialActions?: PoLineSerialActions;
  /** Matched lane: unlink / split a serial onto its own row, from the title ⋮. */
  serialSplit?: Omit<PoLineSerialSplitContext, 'receivingId'>;
  /** Carton-open snapshot of `receiving.accordionExpand` (inert; caller compat). */
  accordionBootstrap?: 'default' | 'all';
  /** Matched lane: the grade of the unit selected in the active row's body. */
  activeConditionOverride?: string | null;
  /** Matched lane: meta chip → focus that step in the dock (Unbox dual loci). */
  onEditConditionInDock?: (line: ReceivingLineRow) => void;
  onEditSerialInDock?: (line: ReceivingLineRow) => void;
  /**
   * Rendered above the UNFOUND lane only — a station's "what to do next" for a
   * carton with nothing on it yet. Never shown on the matched lane, which has
   * rows to speak for themselves.
   */
  laneNotice?: ReactNode;
}

export function PoItemsSection({
  row,
  activeRowSlot,
  activeSerialActions,
  serialSplit,
  accordionBootstrap,
  activeConditionOverride,
  onEditConditionInDock,
  onEditSerialInDock,
  laneNotice,
  ...shared
}: PoItemsSectionProps) {
  const lane = usePoItemsLane(row, shared.receivingId);
  const activeLineId = shared.activeLineId ?? row.id;
  // A synthetic unfound stub carries a negative id and is not a paintable seed.
  const placeholderActiveRow =
    shared.placeholderActiveRow ?? (row.id > 0 ? row : undefined);

  if (lane === 'unmatched') {
    const surface = (
      <UnmatchedItemsSection
        {...shared}
        activeLineId={activeLineId}
        placeholderActiveRow={placeholderActiveRow}
      />
    );
    return laneNotice ? (
      <div className="space-y-2">
        {laneNotice}
        {surface}
      </div>
    ) : (
      surface
    );
  }

  return (
    <PoLinesAccordion
      receivingId={shared.receivingId}
      activeLineId={activeLineId}
      placeholderActiveRow={placeholderActiveRow}
      embedded={shared.embedded}
      headerRight={shared.headerRight}
      suppressHeader={shared.suppressHeader}
      // Mirrors UnmatchedAccordionSurface exactly: legacy callers tied
      // interactivity to showSerialScan, and the two lanes must not disagree
      // about whether the same carton is editable.
      readOnly={shared.readOnly ?? !(shared.showSerialScan ?? true)}
      unitsChrome={shared.unitsChrome}
      hideNoTestLines={shared.hideNoTestLines}
      lineCollapse={shared.lineCollapse}
      accordionBootstrap={accordionBootstrap}
      activeRowSlot={activeRowSlot}
      activeSerialActions={activeSerialActions}
      activeConditionOverride={activeConditionOverride}
      serialSplit={serialSplit}
      onViewAllUnits={shared.onViewAllUnits}
      onEditConditionInDock={onEditConditionInDock}
      onEditSerialInDock={onEditSerialInDock}
    />
  );
}
