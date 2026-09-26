import { fromZonedTime } from 'date-fns-tz';
import { WAREHOUSE_TIME_ZONE } from '@/utils/date';

/**
 * Carrier scan stamps → true instants.
 *
 * Every carrier reports a scan as a LOCAL wall clock at the scan facility, and
 * each API carries the zone differently:
 *
 *   UPS   activity.date "YYYYMMDD" + time "HHMMSS" (local), gmtDate + gmtTime
 *         "HH:MM:SS" (UTC), gmtOffset "-07:00".
 *   FedEx scanEvents[].date ISO with offset ("2026-05-15T17:39:53-05:00");
 *         date-only pickups arrive as "2026-06-12T00:00:00" with NO offset.
 *   USPS  trackingEvents[].GMTTimestamp "…Z" (UTC), eventTimestamp (local,
 *         no offset), GMTOffset "-07:00".
 *
 * Precedence per event: explicit UTC stamp → local stamp + explicit offset →
 * local stamp with no zone at all, read as the warehouse zone. The last rung is
 * a documented guess (the API gave nothing better); reading it as UTC — the
 * old behaviour — is never right for a carrier's local wall clock, and reading
 * it in the host's zone made the stored instant depend on which box ran the
 * sync.
 *
 * SQL twin: src/lib/migrations/2026-09-25h_carrier_event_instants_backfill.sql
 * recomputes stored rows with the same precedence — keep the two in step, or a
 * re-sync inserts a duplicate event (the dedupe key includes the instant).
 */

type Fields = Record<string, unknown>;

function fieldsOf(value: unknown): Fields {
  return value && typeof value === 'object' ? (value as Fields) : {};
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const OFFSET_RE = /^([+-])(\d{2}):?(\d{2})$/;

/** "+HH:MM" | "-HHMM" | "Z" → canonical "+HH:MM", or null. */
export function normalizeUtcOffset(raw: unknown): string | null {
  const s = nonEmptyString(raw);
  if (!s) return null;
  if (s === 'Z' || s === 'z') return '+00:00';
  const m = OFFSET_RE.exec(s);
  if (!m || Number(m[2]) > 14 || Number(m[3]) > 59) return null;
  return `${m[1]}${m[2]}:${m[3]}`;
}

/** "YYYYMMDD" | "YYYY-MM-DD" → "YYYY-MM-DD", or null. */
function isoDatePart(raw: unknown): string | null {
  const digits = nonEmptyString(raw)?.replace(/-/g, '');
  if (!digits || !/^\d{8}$/.test(digits)) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/** "HHMMSS" | "HH:MM:SS" | "HHMM" | "HH:MM" → "HH:MM:SS", or null. */
function isoTimePart(raw: unknown): string | null {
  const digits = nonEmptyString(raw)?.replace(/:/g, '');
  if (!digits || !/^\d{4}(\d{2})?$/.test(digits)) return null;
  const ss = digits.length === 6 ? digits.slice(4, 6) : '00';
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${ss}`;
}

function toIso(d: Date): string | null {
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Local wall clock ("YYYY-MM-DDTHH:MM:SS") → instant: at `offset` when the
 * carrier gave one, else in the warehouse zone.
 */
export function wallClockInstant(wall: string, offset: string | null): string | null {
  return toIso(offset ? new Date(`${wall}${offset}`) : fromZonedTime(wall, WAREHOUSE_TIME_ZONE));
}

const ISO_WALL_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(\.\d+)?$/;
const ISO_ZONED_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * ISO-ish timestamp → instant. Carries its own zone ("…Z" / "…-05:00") → as
 * given; a bare wall clock → `fallbackOffset` when supplied, else the
 * warehouse zone. FedEx `scanEvents[].date` / `dateAndTimes[].dateTime` go
 * through here directly.
 */
export function isoStampInstant(raw: unknown, fallbackOffset: string | null = null): string | null {
  const s = nonEmptyString(raw);
  if (!s) return null;
  if (ISO_ZONED_RE.test(s)) return toIso(new Date(s));
  const m = ISO_WALL_RE.exec(s);
  if (!m) return null;
  const time = m[2].length === 5 ? `${m[2]}:00` : m[2];
  return wallClockInstant(`${m[1]}T${time}${m[3] ?? ''}`, fallbackOffset);
}

// ─── UPS ──────────────────────────────────────────────────────────────────────

/** True instant of one UPS `activity[]` entry. */
export function upsActivityInstant(activity: unknown): string | null {
  const act = fieldsOf(activity);
  const gmtDate = isoDatePart(act.gmtDate);
  const gmtTime = isoTimePart(act.gmtTime);
  if (gmtDate && gmtTime) return toIso(new Date(`${gmtDate}T${gmtTime}Z`));

  const date = isoDatePart(act.date);
  if (!date) return null;
  return wallClockInstant(
    `${date}T${isoTimePart(act.time) ?? '00:00:00'}`,
    normalizeUtcOffset(act.gmtOffset),
  );
}

/**
 * The pre-fix UPS event stamp — the LOCAL wall clock written as if UTC. Kept
 * ONLY as the stable identity inside `external_event_id`: every stored UPS row
 * already embeds it, and changing it would make the next sync insert every
 * event a second time. Never use it as a time.
 */
export function upsActivityLegacyStamp(activity: unknown): string | null {
  const act = fieldsOf(activity);
  const date = isoDatePart(act.date);
  if (!date) return null;
  return toIso(new Date(`${date}T${isoTimePart(act.time) ?? '00:00:00'}Z`));
}

// ─── USPS ─────────────────────────────────────────────────────────────────────

/** "March 9, 2025" + "8:00 am" (legacy USPS shape, no zone) → wall clock. */
function legacyUspsWallClock(eventDate: unknown, eventTime: unknown): string | null {
  const date = nonEmptyString(eventDate);
  if (!date) return null;
  const time = nonEmptyString(eventTime);
  // Host-local parse, then read the host-local fields back: the wall clock
  // survives whatever zone the host runs in.
  const d = new Date(time ? `${date} ${time}` : date);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** True instant of one USPS tracking event. */
export function uspsEventInstant(event: unknown): string | null {
  const raw = fieldsOf(event);
  const gmt = nonEmptyString(raw.GMTTimestamp ?? raw.gmtTimestamp);
  // GMTTimestamp is UTC by definition; tolerate a missing "Z".
  const fromGmt = gmt ? isoStampInstant(gmt, '+00:00') : null;
  if (fromGmt) return fromGmt;

  const offset = normalizeUtcOffset(raw.GMTOffset ?? raw.gmtOffset);
  const fromLocal = isoStampInstant(raw.eventTimestamp ?? raw.EventTimestamp, offset);
  if (fromLocal) return fromLocal;

  const wall = legacyUspsWallClock(raw.eventDate ?? raw.EventDate, raw.eventTime ?? raw.EventTime);
  return wall ? wallClockInstant(wall, offset) : null;
}
