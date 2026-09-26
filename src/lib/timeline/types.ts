import type React from 'react';

/** Semantic color for timeline *badges* (exception / signed-by pills). */
export type TimelineTone = 'default' | 'info' | 'success' | 'warning' | 'danger' | 'fulfillment' | 'muted';

export interface TimelineItemBadge {
  label: string;
  tone: TimelineTone;
}

/** One field-level before→after change, rendered as a muted `key: */
export interface TimelineChange {
  key: string;
  before: string | null;
  after: string | null;
}

/** An identifier attached to an event (tracking #, serial, FNSKU, order/PO id, SKU). */
export type TimelineRefKind =
  | 'tracking'
  | 'serial'
  | 'fnsku'
  | 'id'
  | 'sku'
  | 'bin'
  | 'ticket';

export interface TimelineRef {
  value: string;
  kind: TimelineRefKind;
  /**
   * Optional deep-link (bin → `/inventory/location/…`, ticket → support).
   * When set, the chip wraps a Link; copy-on-click still works via CopyChip.
   */
  href?: string;
  /**
   * Optional chip label override. Serial chips normally derive last-8 from
   * `value`; set this when a longer suffix is needed (sibling last-8 collision
   * on a batch journey row — see `disambiguateSerialDisplays`).
   */
  display?: string;
}

/** A photo attached to an event, rendered by {@link EventTimeline} as an inline thumbnail strip (unbox / testing captures on a unit timeline). */
export interface TimelineMedia {
  photoId: number;
  thumbUrl: string;
  fullUrl: string;
  caption?: string;
}

/** Describes the band a row belongs to in the serial-grouped view. */
export interface TimelineGroupKey {
  key: string;
  label: string;
  ref?: TimelineRef;
}

/** Band key for ref-less / un-grouped rows in the serial-grouped view. */
export const TIMELINE_OTHER_BAND_KEY = '__order__';

/** One generic, domain-agnostic event row. */
export interface TimelineItem {
  id: string | number;
  /** Event time; the component formats + day-groups by this. */
  at: string | null;
  /** Primary line. */
  title: string;
  /** Badge / legacy tone (default 'info'). Rail markers ignore this. */
  tone?: TimelineTone;
  /** Secondary line (location / detail), rendered muted under the title. */
  subtitle?: string;
  /** Field-level before→after diff (audit rows), rendered as a small muted list under the subtitle. */
  changes?: TimelineChange[];
  /** Identifier shown as a last-8 CopyChip under the title (tracking/serial/…). */
  ref?: TimelineRef;
  /**
   * Optional chip cluster (e.g. multi-serial batch put-away). When set,
   * {@link EventTimeline} renders these as the identity chips and ignores
   * `ref` for display. Prefer a single `ref` for one-id rows.
   */
  refs?: TimelineRef[];
  /** Actor name — rendered after the time as "· {actor}". */
  actor?: string;
  /** The actor's `staff.id`, when the source row carries one. */
  actorStaffId?: number | null;
  /** Optional pills below the title (signed-by, exception, …). */
  badges?: TimelineItemBadge[];
  /**
   * Rare escape: custom rail glyph. Prefer `sourceEventType` +
   * `resolveTimelineGlyph` — do not use this for domain mode identity.
   */
  icon?: React.ReactNode;
  /**
   * Deep-link for the rail mode glyph (Unbox / Support / History / …).
   * When omitted, {@link EventTimeline} falls back to `ref.href` if present.
   */
  href?: string;
  /** Inline photo thumbnails for this event (unbox / testing captures). */
  media?: TimelineMedia[];
  /** The adapter's raw source event-type string (e.g. */
  sourceEventType?: string;
}
