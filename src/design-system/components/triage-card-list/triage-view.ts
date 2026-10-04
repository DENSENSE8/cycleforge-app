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

import type { ReactElement, ReactNode } from 'react';
import type { RecordCardModel, RecordCardStatus } from '../record-card/record-card-types';
import type { RecordFactColumn } from '../record-card/record-fact';
import type { TriageCardModelBase, TriageCardSlotProps, TriageFamily } from './TriageCardList';
import type { RowGroup } from '@/lib/group-rows';
import type { TriageSectionTone } from './TriageListBody';
import type { RecordStateFace } from '@/design-system/tokens/record';

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

/** Who the person on line 1 is to the record; `none` = the card paints no person. */
export type TriageViewPerson = 'buyer' | 'customer' | 'vendor' | 'staff' | 'source' | 'kind' | 'none';

/**
 * The card's anatomy slots, declared per view with an explicit `none` — the
 * card paints a slot iff its view declares it (`card-view-contract.ts`; the
 * typed {@link ViewCardModel} / {@link ViewQuickLookProps} make the compiler
 * hold `RecordCard` to it).
 */
export interface TriageViewSlots {
  /** Line-1 identity in words: what names one card ('order number', 'room · rack', 'carton R-number'). */
  identity: string;
  /** The channel on line 1 (brand dot + name): `RecordCardModel.channel` is painted iff `brand`. */
  channel: 'brand' | 'none';
  /** The person on the record: `RecordCardModel.person` is painted iff not `none`. */
  person: TriageViewPerson;
  /** Space quick look under the card: a real peek iff `peek`; `none` is a deliberate, declared absence. */
  quickLook: 'peek' | 'none';
  /**
   * The line's photo column (Full card and Compact row alike): `line` = the family has a photo
   * source (a line without one still holds the square); `none` = it has none, so no empty well.
   */
  photo: 'line' | 'none';
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
  /** Top-right status painter (Law 3); `none` = the card paints no status. */
  status: RecordCardStatus['kind'];
  /** The card's anatomy slots — identity, channel, person, quick look. */
  slots: TriageViewSlots;
  /** A line's facts, in the order the eye reads them — the lead sentence and the unfolded columns. */
  facts: readonly RecordFactColumn[];
  sections: TriageViewSections | null;
  /** Every next-step verb this view's cards can paint, in workflow order (present tense). */
  next: readonly string[];
}

/** The part of a view a card is typed by. */
export type CardViewDecl = Pick<TriageViewDecl, 'status' | 'slots'>;

/**
 * Declare a view with its `status` and `slots` kept literal, so `RecordCard`
 * (and a family's typed card-model builder) can be held to them at compile
 * time. Every view in `src/lib/triage/views/` is declared through it.
 */
export function triageView<
  const S extends RecordCardStatus['kind'],
  const C extends TriageViewSlots['channel'],
  const P extends TriageViewPerson,
  const Q extends TriageViewSlots['quickLook'],
>(
  decl: TriageViewDecl & { status: S; slots: { identity: string; channel: C; person: P; quickLook: Q } },
): TriageViewDecl & { status: S; slots: { identity: string; channel: C; person: P; quickLook: Q } } {
  return decl;
}

/**
 * The card model a view admits: the status painter it declares, and no
 * channel / person where it declares `none`. A declared channel / person may
 * still be null on one record that has none.
 */
export type ViewCardModel<V extends CardViewDecl> = Omit<RecordCardModel, 'status' | 'channel' | 'person'> & {
  status: Extract<RecordCardStatus, { kind: V['status'] }>;
  channel: V['slots']['channel'] extends 'none' ? null : RecordCardModel['channel'];
  person: V['slots']['person'] extends 'none' ? null : RecordCardModel['person'];
};

/** The quick look a view admits: a `peek` view must pass its peek; a `none` view passes none (never `null`). */
export type ViewQuickLookProps<V extends CardViewDecl> = [V['slots']['quickLook']] extends ['none']
  ? { quickLook?: never }
  : [V['slots']['quickLook']] extends ['peek']
    ? { quickLook: ReactElement }
    : { quickLook?: ReactElement };

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
