import type React from 'react';

/**
 * Semantic color for timeline *badges* (exception / signed-by pills). The rail
 * no longer uses tone dots — {@link EventTimeline} resolves mode glyphs via
 * `sourceEventType` + `resolveTimelineGlyph`. Callers choose tones for badges,
 * never raw classes. A lifecycle event (packed, shipped) takes its tone from
 * `LIFECYCLE[state].tone` (`@cycleforge/design-tokens`) — `fulfillment` is
 * packed's.
 */
export type TimelineTone = 'default' | 'info' | 'success' | 'warning' | 'danger' | 'fulfillment' | 'muted';

export interface TimelineItemBadge {
  label: string;
  tone: TimelineTone;
}

/**
 * One field-level before→after change, rendered as a muted `key: before → after`
 * line under the row (the audit-diff slot). Produced by `diffChanges`
 * (`src/lib/timeline/audit-diff.ts`) from an audit row's before/after snapshots.
 * `before`/`after` are pre-formatted display strings (or null = absent).
 */
export interface TimelineChange {
  key: string;
  before: string | null;
  after: string | null;
}

/**
 * An identifier attached to an event (tracking #, serial, FNSKU, order/PO id,
 * SKU). The {@link EventTimeline} renders it through the shared `CopyChip`
 * family — last-8 preview, copy-on-click, tone+icon — so timeline ids look and
 * behave exactly like ids everywhere else in the app. Adapters pass the raw
 * value + kind; the chip owns the last-8 formatting.
 */
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

/**
 * A photo attached to an event, rendered by {@link EventTimeline} as an inline
 * thumbnail strip (unbox / testing captures on a unit timeline). Click opens
 * the shared photo-gallery SoT (`usePhotoGallery` + `PhotoViewerPortal` →
 * `PhotoViewerModal`); the renderer never fetches — the section component
 * pre-attaches the media. Omit ⇒ no media block (existing consumers are
 * unaffected).
 */
export interface TimelineMedia {
  photoId: number;
  thumbUrl: string;
  fullUrl: string;
  caption?: string;
}

/**
 * Describes the band a row belongs to in the serial-grouped view. By default
 * {@link EventTimeline} derives this from each row's own {@link TimelineRef},
 * but a caller can supply a `groupKeyOf` selector to bucket by a chosen
 * dimension (order / serial / tracking) — `key` is the band identity, `label`
 * the fallback text, and `ref` the optional chip rendered in the band header.
 */
export interface TimelineGroupKey {
  key: string;
  label: string;
  ref?: TimelineRef;
}

/**
 * Band key for ref-less / un-grouped rows in the serial-grouped view. The
 * {@link EventTimeline} sorts this band LAST so identified bands lead. A
 * `groupKeyOf` selector can return this key (with its own label) to force rows
 * lacking the chosen grouping dimension into the trailing band instead of
 * fragmenting them into incidental ref bands.
 */
export const TIMELINE_OTHER_BAND_KEY = '__order__';

/**
 * One generic, domain-agnostic event row. Per-domain feed adapters
 * (`src/lib/timeline/*`) map their source — carrier events, audit logs, repair
 * history, … — into `TimelineItem[]`; the {@link EventTimeline} component knows
 * nothing about any domain.
 */
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
  /**
   * Field-level before→after diff (audit rows), rendered as a small muted list
   * under the subtitle. Populated only for edit-style audit events where BOTH
   * snapshots are present and the caller is permitted to see them — see
   * `diffChanges` and the route-level redaction in the operations journey. Omit
   * ⇒ no diff block (every existing consumer is unaffected).
   */
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
  /**
   * The actor's `staff.id`, when the source row carries one. Purely additive to
   * {@link actor}, which stays the display copy.
   *
   * {@link EventTimeline} renders the staffer's profile photo (via
   * `<StaffAvatar>`) beside the name when this is present. An adapter whose
   * query resolved only a NAME must leave it undefined — an avatar is never
   * guessed from a display name, because two people share one and the row would
   * then attribute work to the wrong face.
   */
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
  /**
   * Inline photo thumbnails for this event (unbox / testing captures). Rendered
   * as a horizontal thumbnail strip under the row; click opens the shared
   * PhotoViewerModal. Omit ⇒ no media block. The adapter attaches these —
   * {@link EventTimeline} never fetches.
   */
  media?: TimelineMedia[];
  /**
   * The adapter's raw source event-type string (e.g. `inventory_events.event_type`
   * — 'SHIPPED', 'RETURNED', …), when the source spine has one.
   *
   * {@link EventTimeline} reads this only to resolve the rail mode glyph via
   * `resolveTimelineGlyph` (never for titles). Domain-aware merge helpers
   * (e.g. `SerialJourneySection` round-trip counts) may also key off it —
   * never pattern-match the display `title` string.
   *
   * Adapters should set this whenever the source has a stable type enum so the
   * rail never falls back to the generic signal glyph.
   */
  sourceEventType?: string;
}
