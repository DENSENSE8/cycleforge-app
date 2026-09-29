/**
 * A triage VIEW's declaration — the pattern card as data, one per nav view
 * (`NAV_PAGE_DECLS[page].items[view]`: `outbound.triage`, `incoming.pipeline`,
 * `incoming.docked`, …), never per page and never per table. Two views of
 * one page can be drastically different (Shipping vs FBA vs Exceptions); two
 * pages share the face. The face paints; the view says what a row MEANS on
 * that view: its grain, what the eye reads first (facts, in order), the
 * top-right status kind, the next-step vocabulary, sections, chips and keys.
 *
 * Declarations live in `src/lib/triage/views/` (one file per view) and are
 * checked against the nav's own view and saved-view declarations — a chip
 * param a saved view cannot keep is a declaration error, not a runtime bug.
 */

import type { ReactNode } from 'react';
import type { RecordCardStatus } from '../record-card/record-card-types';
import type { RecordFactColumn } from '../record-card/record-fact';
import type { TriageCardModelBase, TriageCardSlotProps, TriageFamily } from './TriageCardList';
import type { RowGroup } from '@/lib/group-rows';
import type { TriageSectionTone } from './TriageListBody';
import type { RecordStateFace } from '@/design-system/tokens/industrial-record';

/** `page.view`, exactly the nav's ids (`incoming.docked`). */
export type TriageViewId = `${string}.${string}`;

export interface TriageViewSections {
  /** Fixed band order, most urgent first — the host bands in this order. */
  order: readonly string[];
  labels: Readonly<Record<string, string>>;
  /** Header ink per band; unlisted bands read muted. */
  tones: Readonly<Partial<Record<string, TriageSectionTone>>>;
  /** Sections show only under the view's default sort (the sidebar's Sort re-orders past them). */
  when: 'default-sort' | 'always';
}

export interface TriageViewDecl {
  id: TriageViewId;
  /** The record ONE card is (the plane opens it): `order`, `purchase`, `carton`, … */
  grain: string;
  noun: { one: string; many: string };
  /** The list's accessible name. */
  listLabel: string;
  testIdPrefix: string;
  bodyTestId: string;
  /** Per-person page mode + per-path scroll place. */
  storageKeys: { pageMode: string; scrollTop: string };
  /** URL params naming the open record — never part of a saved view. */
  recordParams: readonly string[];
  /**
   * Status chips: `face` = the triage face's own URL cut (`useTriageCut`);
   * `host` = the page's own chip set. Either way `param` must round-trip the
   * view's saved views.
   */
  chips: { owner: 'face' | 'host'; param: string };
  /** `server`: the host pages (`?page=` ladder); `client`: the face slices what is loaded. */
  paging: 'client' | 'server';
  /** Top-right status painter (Law 3). */
  status: RecordCardStatus['kind'];
  /** A line's facts, in the order the eye reads them — the lead sentence and the unfolded columns. */
  facts: readonly RecordFactColumn[];
  sections: TriageViewSections | null;
  /** Every next-step verb this view's cards can paint, in workflow order (present tense). */
  next: readonly string[];
}

/** The adapter's half — row functions only; everything declarative comes from the view. */
export interface TriageViewParts<Row, Model extends TriageCardModelBase<Row>> {
  rowId: (row: Row) => number;
  groupKey: (group: RowGroup<Row>) => string;
  cardModel: (group: RowGroup<Row>, band: string) => Model;
  state?: (group: RowGroup<Row>, band: string) => RecordStateFace;
  exactFind?: (query: string, model: Model) => boolean;
  renderCard: (props: TriageCardSlotProps<Row, Model>) => ReactNode;
}

/** The face's family for a view: its declaration + the adapter's row functions. */
export function triageFamily<Row, Model extends TriageCardModelBase<Row>>(
  view: TriageViewDecl,
  parts: TriageViewParts<Row, Model>,
): TriageFamily<Row, Model> {
  const sections = view.sections;
  return {
    noun: view.noun,
    testIdPrefix: view.testIdPrefix,
    listLabel: view.listLabel,
    bodyTestId: view.bodyTestId,
    storageKeys: view.storageKeys,
    ...parts,
    section: sections
      ? (band) => ({ label: sections.labels[band] ?? band, tone: sections.tones[band] ?? 'muted' })
      : undefined,
  };
}
