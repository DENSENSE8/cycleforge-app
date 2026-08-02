/**
 * Pure merge for Station Timeline unit journeys — one carton-scoped feed
 * instead of N {@link SerialJourneySection} embeds.
 *
 * Each serial's journey events go through {@link mergeJourney} (same adapters
 * as Operations History), its stage photo rows fold in via
 * {@link mergeJourneyWithUnitPhotos} (full stage `media` kept — display cap /
 * `+N` lives in {@link EventTimeline}'s media strip), then rows are namespaced,
 * sorted newest-first, and given a serial {@link TimelineRef} so
 * {@link EventTimeline} renders the shared {@link SerialChip} (last-8 via
 * CopyChip SoT).
 *
 * Carton-scoped photo stages (`arrival`, `unbox_carton`) whose photo-id set is
 * shared across ≥2 sibling serials hoist once as `carton:unit-photos-*` (no
 * serial chip) so a multi-unit carton does not look like the same journey twice.
 *
 * Batch inventory hops (same title / actor / clock / trail on different serials
 * — typical multi-unit receive + put-away) fold into one “N units” row with a
 * `refs` SerialChip cluster (disambiguated when sibling last-8s collide). Bin /
 * location stays in the subtitle only — never as the identity chip.
 */

import { mergeJourney, type JourneyEvent } from '@/lib/timeline/journey';
import { mergeJourneyWithUnitPhotos } from '@/lib/timeline/journey-photos';
import { collapseTimeline } from '@/lib/timeline/collapse';
import type { TimelineItem, TimelineRef } from '@/lib/timeline/types';
import type { UnitTimelinePhotoRow } from '@/lib/timeline/unit-photos-events';
import {
  disambiguateSerialDisplays,
  getLast8Serial,
} from '@/lib/copy-chip-format';

/** Photo stage ids that attach to the parent carton, not a single unit. */
const CARTON_PHOTO_STAGE_IDS = new Set(['unit-photos-arrival', 'unit-photos-unbox_carton']);

export type SerialJourneyBucket = {
  serial: string;
  events: JourneyEvent[];
  /**
   * Five-stage photo rows for this serial's unit (optional — absent/failed
   * photo fetches degrade to an events-only journey for that serial).
   */
  photos?: UnitTimelinePhotoRow[];
};

function photoFingerprint(item: TimelineItem): string {
  return (item.media ?? [])
    .map((m) => m.photoId)
    .sort((a, b) => a - b)
    .join(',');
}

/**
 * Carton feed rows that may batch — any per-serial inventory hop. Photo stages
 * stay out so carton media is not folded into hops.
 */
function isBatchableCartonRow(item: TimelineItem): boolean {
  const id = String(item.id);
  return id.startsWith('serial:') && !id.includes('unit-photos-');
}

/**
 * Floor `at` to the minute. The timeline clock is `h:mma`, so same-minute
 * sibling put-aways / receives look identical even when ms (or seconds) differ.
 */
function batchAtBucket(at: string | null | undefined): string {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at.slice(0, 16);
  return new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    0,
    0,
  )).toISOString().slice(0, 16);
}

/**
 * Batch signature — ignores serial ref so sibling units put away / received
 * in the same minute collapse into one row instead of stacking twin last-8 chips.
 */
function batchHopSignature(item: TimelineItem): string {
  return [
    item.title,
    item.actor ?? '',
    item.tone ?? '',
    batchAtBucket(item.at),
    item.subtitle ?? '',
    item.sourceEventType ?? '',
  ].join('|');
}

/** Serial identity from a carton feed row (ref first; id prefix as fallback). */
function serialFromCartonRow(item: TimelineItem): string | undefined {
  if (item.ref?.kind === 'serial' && item.ref.value.trim()) {
    return item.ref.value.trim();
  }
  const id = String(item.id);
  if (!id.startsWith('serial:')) return undefined;
  // `serial:<sn>:<sourceId>` — sourceId may itself contain colons (`inv:1`).
  const rest = id.slice('serial:'.length);
  const invAt = rest.indexOf(':inv:');
  if (invAt >= 0) return rest.slice(0, invAt) || undefined;
  const photosAt = rest.indexOf(':unit-photos-');
  if (photosAt >= 0) return rest.slice(0, photosAt) || undefined;
  const colon = rest.indexOf(':');
  if (colon <= 0) return undefined;
  return rest.slice(0, colon) || undefined;
}

/** Multi-serial identity chips — longer display only when last-8s collide. */
function batchSerialRefs(serials: string[]): TimelineRef[] {
  const displays = disambiguateSerialDisplays(serials);
  return serials.map((value, i) => {
    const display = displays[i]!;
    const ref: TimelineRef = { kind: 'serial', value };
    if (display !== getLast8Serial(value)) ref.display = display;
    return ref;
  });
}

/**
 * Fold carton inventory hops that are identical except for the unit chip into
 * one row (“Put away · … · 2 units”). Groups by signature across the whole
 * feed (not only adjacent) so an interleaved hop cannot leave twin rows.
 */
export function collapseCrossSerialBatchHops(items: TimelineItem[]): TimelineItem[] {
  const indicesBySig = new Map<string, number[]>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (!isBatchableCartonRow(item)) continue;
    const sig = batchHopSignature(item);
    const list = indicesBySig.get(sig);
    if (list) list.push(i);
    else indicesBySig.set(sig, [i]);
  }

  const emitted = new Set<string>();
  const out: TimelineItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (!isBatchableCartonRow(item)) {
      out.push(item);
      continue;
    }
    const sig = batchHopSignature(item);
    if (emitted.has(sig)) continue;
    emitted.add(sig);

    const idxs = indicesBySig.get(sig) ?? [i];
    const head = items[idxs[0]!]!;
    const count = idxs.length;
    if (count > 1) {
      const unitLabel = `${count} units`;
      const serials = idxs
        .map((ix) => serialFromCartonRow(items[ix]!))
        .filter((s): s is string => !!s);
      const uniqueSerials = [...new Set(serials)];
      out.push({
        ...head,
        id: `batch:${head.sourceEventType ?? head.title}:${batchAtBucket(head.at)}:${count}`,
        // Never bin — location already lives in the subtitle.
        ref: undefined,
        refs: uniqueSerials.length > 0 ? batchSerialRefs(uniqueSerials) : undefined,
        subtitle: head.subtitle ? `${head.subtitle} · ${unitLabel}` : unitLabel,
      });
    } else {
      out.push(head);
    }
  }
  return out;
}

/**
 * Flatten per-serial journey payloads into one Station-density timeline list.
 * Rows always carry `ref.kind === 'serial'` so the last-8 CopyChip is the unit
 * identity — never a bin chip (location stays in the adapter subtitle). Hoisted
 * carton photo stages omit the serial ref; collapsed batch hops use `refs`.
 */
export function mergeStationUnitJourneys(buckets: SerialJourneyBucket[]): TimelineItem[] {
  const prepared: { serial: string; items: TimelineItem[] }[] = [];

  for (const { serial, events, photos } of buckets) {
    const sn = serial.trim();
    if (!sn) continue;
    const { items } = mergeJourney(events);
    const withMedia = mergeJourneyWithUnitPhotos(items, photos);
    prepared.push({ serial: sn, items: withMedia });
  }

  // sourceId → fingerprint → { item, serials that share it }
  const cartonBySource = new Map<
    string,
    Map<string, { item: TimelineItem; serials: string[] }>
  >();

  for (const { serial, items } of prepared) {
    for (const item of items) {
      const sourceId = String(item.id);
      if (!CARTON_PHOTO_STAGE_IDS.has(sourceId)) continue;
      const fp = photoFingerprint(item);
      let byFp = cartonBySource.get(sourceId);
      if (!byFp) {
        byFp = new Map();
        cartonBySource.set(sourceId, byFp);
      }
      const existing = byFp.get(fp);
      if (existing) existing.serials.push(serial);
      else byFp.set(fp, { item, serials: [serial] });
    }
  }

  /** Keys `${sourceId}|${fp}` that appear on ≥2 serials — hoist once. */
  const hoistKeys = new Set<string>();
  const merged: TimelineItem[] = [];

  for (const [sourceId, byFp] of cartonBySource) {
    for (const [fp, { item, serials }] of byFp) {
      if (serials.length < 2) continue;
      hoistKeys.add(`${sourceId}|${fp}`);
      merged.push({
        ...item,
        id: `carton:${sourceId}`,
        ref: undefined,
        subtitle: item.subtitle ? `${item.subtitle} · Carton` : 'Carton',
      });
    }
  }

  for (const { serial, items } of prepared) {
    for (const item of items) {
      const sourceId = String(item.id);
      if (CARTON_PHOTO_STAGE_IDS.has(sourceId)) {
        const fp = photoFingerprint(item);
        if (hoistKeys.has(`${sourceId}|${fp}`)) continue;
      }
      merged.push({
        ...item,
        id: `serial:${serial}:${item.id}`,
        // Always unit identity — never preserve put-away bin as the chip.
        ref:
          item.ref?.kind === 'serial' && item.ref.value.trim()
            ? item.ref
            : { kind: 'serial', value: serial },
      });
    }
  }

  merged.sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return String(b.id).localeCompare(String(a.id));
  });

  return collapseTimeline(collapseCrossSerialBatchHops(merged));
}
