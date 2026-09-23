/**
 * Mobile Current session — the small, station-neutral ledger shown above Daily.
 *
 * This is deliberately separate from the identification kernel. The kernel
 * decides what a scan means and where to land; this contract records the
 * settled result so the phone can show one recent-work list for every job.
 */

export const MOBILE_SESSION_STORAGE_KEY = 'cf.mobile.current-session.v1';
export const MOBILE_SESSION_EVENT = 'mobile-session-entry';
export const MOBILE_SESSION_LIMIT = 40;

export const MOBILE_SESSION_JOBS = ['pick', 'pack', 'unbox', 'display', 'scan'] as const;
export type MobileSessionJob = (typeof MOBILE_SESSION_JOBS)[number] | (string & {});

export type MobileSessionState = 'done' | 'blocked' | 'exception' | 'miss' | 'error';

export interface MobileSessionEntry {
  id: string;
  job: MobileSessionJob;
  title: string | null;
  identifier: string | null;
  entityId: string | null;
  state: MobileSessionState;
  href: string;
  at: string;
  dedupeKey: string | null;
}

export const MOBILE_SESSION_JOB_LABELS: Record<string, string> = {
  pick: 'Picker',
  pack: 'Packer',
  unbox: 'Unbox',
  display: 'Display',
  scan: 'Scan',
};

export function mobileSessionJobLabel(job: string): string {
  return MOBILE_SESSION_JOB_LABELS[job] ?? job;
}

export function pushMobileSessionEntry(
  entries: readonly MobileSessionEntry[],
  entry: MobileSessionEntry,
): MobileSessionEntry[] {
  const rest = entries.filter(
    (row) => row.id !== entry.id && (entry.dedupeKey == null || row.dedupeKey !== entry.dedupeKey),
  );
  return [entry, ...rest].slice(0, MOBILE_SESSION_LIMIT);
}

export function parseMobileSessionEntries(value: string | null): MobileSessionEntry[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMobileSessionEntry).slice(0, MOBILE_SESSION_LIMIT);
  } catch {
    return [];
  }
}

function isMobileSessionEntry(value: unknown): value is MobileSessionEntry {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<MobileSessionEntry>;
  return (
    typeof row.id === 'string' &&
    typeof row.job === 'string' &&
    (row.title == null || typeof row.title === 'string') &&
    (row.identifier == null || typeof row.identifier === 'string') &&
    (row.entityId == null || typeof row.entityId === 'string') &&
    typeof row.state === 'string' &&
    typeof row.href === 'string' &&
    typeof row.at === 'string' &&
    (row.dedupeKey == null || typeof row.dedupeKey === 'string')
  );
}

/** Client-only writer. Session storage keeps this scoped to the current phone tab/session. */
export function recordMobileSessionEntry(entry: MobileSessionEntry): void {
  if (typeof window === 'undefined') return;
  const next = pushMobileSessionEntry(
    parseMobileSessionEntries(window.sessionStorage.getItem(MOBILE_SESSION_STORAGE_KEY)),
    entry,
  );
  try {
    window.sessionStorage.setItem(MOBILE_SESSION_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(MOBILE_SESSION_EVENT));
  } catch {
    // Private browsing/storage quotas must never block the operator's job.
  }
}
