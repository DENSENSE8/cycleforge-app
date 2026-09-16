/**
 * `AiSearchHit → CompoundRowView` — the find plane's adapter.
 *
 * Pure, strings and enums, no JSX: "the moment a family can pass a node, the
 * fork walks back in wearing a view model." This is the ONLY place six entity
 * types collapse into one row, which is invariant 1 (`ENGINE_IS_MONOMORPHIC`):
 * heterogeneity is resolved at the adapter boundary and never enters the
 * engine.
 *
 * ## What the compound row says about one hit
 *
 * - IDS — the VERIFIABLE identifier ({@link searchHitIdentifier}), leading the
 *   row, because a warehouse reader scans top-to-bottom down the left edge and
 *   the thing they are checking against a label is the handle. The carrier
 *   tracking is the cell's second line when the hit has one, which is the same
 *   two-line identity every other desk paints.
 * - TITLE — what the record IS. The entity noun that used to sit under it is a
 *   TRACK now (`search-hits.entity`): the same word on every row of a scoped
 *   list is noise, and the line it cost belongs to a real fact.
 * - STATE — the status word, toned through {@link orderStatusTone}, the one
 *   status map the whole find surface already shares. The dot and the word are
 *   the SAME cell, never a coloured dot on one edge of the row and its word on
 *   the other.
 * - DATES — Hash line = the civil day of `happened_at`, Calendar line = the
 *   clock. A relative stamp alone ("4d") is not enough for SLA work, so the
 *   exact instant rides both hovers.
 *
 * There is no money and no photo behind a search hit; both stay null and the
 * shared cells paint the honest empty face.
 */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import { orderStatusTone, type ChipTone } from '@/components/search/search-result-chips';
import { searchHitIdentifier } from '@/lib/tables/field-catalog/search-hits-resolve';

/**
 * The find surface's five-tone chip vocabulary → the row's three-tone state
 * vocabulary. `alert` is the only attention-grabbing tone and it is spent on
 * the two states a human has to do something about; a shipped or delivered row
 * is finished, and everything else is ordinary progress.
 */
const STATE_TONE_BY_CHIP: Readonly<Record<ChipTone, CompoundStateTone>> = {
  emerald: 'done',
  blue: 'neutral',
  gray: 'neutral',
  amber: 'alert',
  rose: 'alert',
};

/** Stable across entity types — a unit #41 and an order #41 are two rows. */
export function searchHitRowId(hit: AiSearchHit): string {
  return `${hit.entityType}:${hit.id}`;
}

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Compact civil face for the Dates Hash line — no year (slot-table date law). */
function civilFace(iso: string | null | undefined): { label: string; dateKey: string } | null {
  const d = parseInstant(iso);
  return d ? { label: format(d, 'MMM d'), dateKey: format(d, 'yyyy-MM-dd') } : null;
}

/** The Calendar (secondary) line — time of day. */
function clockFace(iso: string | null | undefined): string | null {
  const d = parseInstant(iso);
  return d ? format(d, 'h:mm a') : null;
}

export function searchHitsCompoundView(hit: AiSearchHit): CompoundRowView {
  const facets = hit.facets ?? {};
  const identifier = searchHitIdentifier(hit);
  const tracking = str(facets.tracking_number);
  const status = orderStatusTone(facets.status);
  const day = civilFace(facets.happened_at);
  const clock = clockFace(facets.happened_at);
  const stamp = day && clock ? `${day.label} · ${clock}` : (day?.label ?? clock);

  return {
    id: searchHitRowId(hit),
    thumbUrl: null,
    // A hit with no title is a malformed search doc; name it by the handle it
    // definitely has rather than painting "Untitled" over a real record.
    title: str(hit.title) ?? identifier,
    /**
     * Fallback line only — the layout binds serial + condition as subtitles
     * and a bound subtitle replaces this. The raw wire subtitle is prose
     * (`serial · sku · status`), which is why it is the fallback and not the
     * face: three facts joined by dots do not sort and do not align.
     */
    note: str(hit.subtitle),
    orderId: identifier,
    tracking,
    // Marketplace behind the identity chip; carrier behind the tracking chip.
    // Both come from the hit's own facets — never guessed from the number.
    platformValue: str(facets.source_platform),
    carrier: str(facets.carrier),
    stateLabel: status.label,
    stateTone: STATE_TONE_BY_CHIP[status.tone],
    orderedAt: day ? { label: day.label, tip: stamp ?? day.label, dateKey: day.dateKey } : null,
    // Explicit Hash hover SoT — this family names the chip, so the engine must
    // not prefix "Start date" onto a line that is a find stamp.
    ...(stamp ? { startedHover: stamp } : null),
    // Calendar line = the clock face. Not a deadline: a find plane has no due
    // dates at all, so `days: 0` / not overdue is the honest answer.
    delay: clock ? { days: 0, overdue: false, faceLabel: clock } : null,
    delayTip: stamp ?? undefined,
    amount: null,
  };
}
