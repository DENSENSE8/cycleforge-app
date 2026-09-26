/** ItemRecord — the domain-neutral shape behind the shared item face. */

export interface ItemRecordQuantity {
  /**
   * How many are physically accounted for. Omit on surfaces with no count of
   * their own (a sales order knows what was sold, not what was handled).
   */
  counted?: number | null;
  /** How many are expected / ordered. */
  expected?: number | null;
}

/**
 * One labelled fact under the row — the reference band that a station row has
 * no space for (item numbers, marketplace identifiers, external listings).
 */
export interface ItemRecordFact {
  /** Stable key within one item. */
  id: string;
  /** Uppercase ledger label. */
  label: string;
  /** Rendered value. A caller may pass a node when the value carries chrome. */
  value: React.ReactNode;
  /** Copy-to-clipboard payload. Omit to render no copy control. */
  copyValue?: string | null;
  /** External destination for the value. Omit to render no open control. */
  href?: string | null;
  /** Accessible label for {@link href}. Defaults to `Open ${label}`. */
  hrefLabel?: string | null;
}

export interface ItemRecord {
  /** Stable identity within the list. */
  id: string | number;
  /** Already-resolved display title. Formatting rules stay with the caller. */
  title: string;
  /** Product image. Absent renders the package placeholder face. */
  imageUrl?: string | null;
  sku?: string | null;
  quantity?: ItemRecordQuantity | null;
  /**
   * Condition grade CODE (not a label) — the chip resolves hue and copy from
   * the shared condition registry.
   */
  conditionGrade?: string | null;
  /** Serial numbers. The meta face previews the last few as last-8. */
  serials?: string[] | null;
  /**
   * A deliberate operator waiver — "this item has no serial" — as distinct
   * from "no serial captured yet", which renders an em dash.
   */
  serialAbsent?: boolean;
  /** Per-unit price. */
  unitPrice?: number | string | null;
  /** Reference facts rendered under the row by {@link ItemRecordCard}. */
  facts?: ItemRecordFact[];
}
