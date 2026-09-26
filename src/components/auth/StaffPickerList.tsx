'use client';

/**
 * Row-layout staff picker — the ONE "pick a person" face.
 * than forked per surface. Operator 2026-09-22: *"for the staff id for history
 */

import { useEffect, useMemo, useRef, useState } from 'react';
// Deep paths, not the barrel — see the note in `src/app/signin/page.tsx`.
// Lazy-loaded by `/signin` (public chrome, which mounts no `MotionConfig`), so
// the barrel's engine-carrying primitives must not ride in on this chunk.
import { Panel } from '@/design-system/primitives/Panel';
import { StaffChoiceRowButton } from '@/components/auth/StaffChoiceRowButton';
import { Button } from '@/design-system/primitives/Button';
import { SkeletonBase } from '@/design-system/components/Skeletons';

type StaffRow = {
  id: number;
  name: string;
  role: string;
  has_pin: boolean;
  color_hex: string;
  /** Profile photo id from /api/auth/staff-picker; null ⇒ colour + initials. */
  avatar_photo_id?: number | null;
};

interface StaffPickerListProps {
  /** Staff that should appear at the top under a "RECENT" header. */
  recent?: number[];
  /** Whether `recent` has finished hydrating (callers read it from localStorage in an effect to avoid an SSR mismatch). */
  recentReady?: boolean;
  /** Called when a staff is tapped. */
  onPick: (s: StaffRow) => void;
  /** Error strip under the list (e.g. a failed switch / sign-in). */
  onMessage?: (msg: string | null) => void;
  /** Surfaces the server-side auth policy (e.g. pinless rollout flag). */
  onPolicy?: (policy: { pinless: boolean }) => void;
  /** Case-insensitive name/role filter. Empty = full roster. */
  query?: string;
  /**
   * Drop the Group Panel wrapper. Rows are self-carded (rounded-xl border),
   * so inside a sheet/dialog panel the extra outline is a duplicate.
   * /signin keeps the panel — there it is the card.
   */
  flat?: boolean;
  /** Hide the signed-in staff — the switch sheet lists who you could BECOME. */
  excludeStaffId?: number;
  /** Roster source. Defaults to the sign-in roster; see the module note. */
  endpoint?: string;
  /**
   * Transport for {@link endpoint}. The kiosk passes `kioskFetchHealed` so a
   * tablet that lost its device cookie re-binds and retries instead of
   * rendering "couldn't load the staff list" for the rest of the shift.
   */
  fetcher?: (input: string, init?: RequestInit) => Promise<Response>;
  /** Copy for an EMPTY (but successfully read) roster — not the degraded state. */
  emptyMessage?: string;
  /** Verb in each row's accessible name: "<verb> <name>, <role>". */
  pickVerb?: string;
}

function staffMatchesQuery(staff: StaffRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const role = staff.role.replace(/_/g, ' ').toLowerCase();
  return staff.name.toLowerCase().includes(q) || role.includes(q);
}

export function StaffPickerList({
  recent = [],
  recentReady = true,
  onPick,
  onMessage,
  onPolicy,
  query = '',
  flat = false,
  excludeStaffId,
  endpoint = '/api/auth/staff-picker',
  fetcher,
  emptyMessage = 'No active staff. Ask an admin to add you.',
  pickVerb = 'Sign in as',
}: StaffPickerListProps) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  // "The roster is empty" and "we could not load the roster" are DIFFERENT answers.
  const [degraded, setDegraded] = useState(false);
  // When recent staff exist, keep the full roster collapsed behind a "More"
  // button so the 3 recent names stay the focused, one-tap choice.
  const [showAll, setShowAll] = useState(false);

  // Keep the latest onPolicy without retriggering the load effect. Passing the
  // callback in the dep array re-runs the fetch on every parent render (callers
  // often pass an inline function), which re-renders the list mid-interaction.
  const onPolicyRef = useRef(onPolicy);
  onPolicyRef.current = onPolicy;

  // Bumped by the degraded state's Retry so the load effect re-runs.
  const [reloadKey, setReloadKey] = useState(0);

  // The transport is held in a ref for the same reason `onPolicy` is: callers
  // pass it inline, and putting a fresh function in the dep array re-fetches
  // the roster on every parent render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const load = fetcherRef.current ?? fetch;
        const r = await load(endpoint, { cache: 'no-store' });
        const data = (await r.json().catch(() => null)) as
          | { staff?: StaffRow[]; pinless?: boolean; degraded?: boolean }
          | null;
        if (cancelled) return;
        // A non-OK status, an unparseable body, or an explicit `degraded` flag
        // all mean the same thing to the operator: we do not know the roster.
        if (!r.ok || !data || data.degraded) {
          setDegraded(true);
          setStaff([]);
          return;
        }
        setDegraded(false);
        setStaff(data.staff || []);
        onPolicyRef.current?.({ pinless: Boolean(data.pinless) });
      } catch {
        // Offline / DNS / abort — also "we do not know", never "nobody works here".
        if (!cancelled) { setDegraded(true); setStaff([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey, endpoint]);

  const { recentRows, otherRows } = useMemo(() => {
    const visible = staff.filter((s) => s.id !== excludeStaffId && staffMatchesQuery(s, query));
    const map = new Map(visible.map((s) => [s.id, s] as const));
    const recents: StaffRow[] = [];
    for (const id of recent) {
      const hit = map.get(id);
      if (hit) { recents.push(hit); map.delete(id); }
    }
    return { recentRows: recents, otherRows: Array.from(map.values()) };
  }, [staff, recent, query, excludeStaffId]);
  const filteredEmpty = staff.length > 0 && recentRows.length === 0 && otherRows.length === 0;
  const searching = query.trim().length > 0;

  if (loading || !recentReady) return <StaffPickerSkeleton />;
  // Degraded (could not load) is checked BEFORE absence — the two states share
  // an empty `staff` array and only this flag tells them apart.
  if (degraded) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-6 py-10 text-center"
      >
        <p className="text-sm text-rose-900">Couldn’t load the staff list.</p>
        <p className="mt-1 text-role-caption text-rose-700">
          This is a connection problem, not an empty roster.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => { setLoading(true); setReloadKey((n) => n + 1); }}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (staff.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-default px-6 py-10 text-center text-sm text-text-soft">
        {emptyMessage}
      </div>
    );
  }

  const hasRecent = !searching && recentRows.length > 0;
  // With recent names on top, the rest collapse behind "More". Search and
  // an empty-recent roster show the full match list. Without any recent,
  // the full roster is the primary list and always shows.
  const showOthers = searching || !hasRecent || showAll;

  if (filteredEmpty) {
    return (
      <div className="rounded-xl border border-dashed border-border-default px-6 py-10 text-center text-sm text-text-soft">
        No staff match that search.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {hasRecent && (
        <Group label="Recent" flat={flat}>
          {recentRows.map((s) => (
            <Row key={s.id} staff={s} onPick={onPick} onMessage={onMessage} pickVerb={pickVerb} isRecent />
          ))}
        </Group>
      )}
      {showOthers && otherRows.length > 0 && (
        <Group label={hasRecent ? 'All staff' : undefined} flat={flat}>
          {otherRows.map((s) => (
            <Row key={s.id} staff={s} onPick={onPick} onMessage={onMessage} pickVerb={pickVerb} />
          ))}
        </Group>
      )}
      {hasRecent && !showAll && otherRows.length > 0 && (
        // ds-raw-button: inline disclosure to reveal the full staff roster.
        // Outline is inset so a parent overflow-y-auto cannot clip it
        // (CSS turns overflow-x to auto whenever overflow-y is not visible).
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="ds-raw-button group flex w-full items-center justify-center gap-1.5 rounded-2xl bg-surface-card/80 px-3.5 py-2.5 text-role-caption font-semibold text-text-soft ring-1 ring-inset ring-border-soft backdrop-blur-sm transition hover:ring-border-default hover:text-text-default"
        >
          More
          <span className="text-text-faint">·</span>
          <span className="font-medium text-text-faint">{otherRows.length} more staff</span>
          <svg
            className="h-3.5 w-3.5 text-text-faint transition group-hover:translate-y-0.5"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}

function Group({ label, flat, children }: { label?: string; flat?: boolean; children: React.ReactNode }) {
  return (
    <div>
      {label && (
        <div className="mb-2 px-1 text-role-micro font-semibold uppercase tracking-[0.18em] text-text-faint">
          {label}
        </div>
      )}
      {flat ? (
        <div className="space-y-2">{children}</div>
      ) : (
        <Panel radius="2xl" padding="none" className="overflow-hidden bg-surface-card/80 backdrop-blur-sm shadow-gray-900/[0.03]">
          {children}
        </Panel>
      )}
    </div>
  );
}

interface RowProps {
  staff: StaffRow;
  onPick: (s: StaffRow) => void;
  onMessage?: (msg: string | null) => void;
  isRecent?: boolean;
  /** "<verb> <name>, <role>" — the act this pick performs on THIS surface. */
  pickVerb: string;
}

function Row({ staff: s, onPick, onMessage, isRecent, pickVerb }: RowProps) {
  return (
    // ONE staff row on the auth surface:
    // (email-flow display, operator 2026-09-08). The old per-staff
    // "tap to set up" was noise (operator 2026-09-15).
    <StaffChoiceRowButton
      staffId={s.id}
      name={s.name}
      role={s.role}
      colorHex={s.color_hex}
      avatarPhotoId={s.avatar_photo_id ?? null}
      isRecent={isRecent}
      ariaLabel={`${pickVerb} ${s.name}, ${s.role}`}
      onPick={() => {
        onMessage?.(null);
        onPick(s);
      }}
    />
  );
}

function StaffPickerSkeleton() {
  return (
    <Panel radius="2xl" padding="none" className="overflow-hidden bg-surface-card/80 backdrop-blur-sm shadow-gray-900/[0.03]">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex w-full items-center gap-3 border-b border-border-hairline px-3.5 py-3 last:border-b-0"
        >
          <SkeletonBase circle width="44px" height="44px" className="flex-shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBase width="35%" height="0.95rem" />
            <SkeletonBase width="22%" height="0.6rem" />
          </div>
          <SkeletonBase width="16px" height="16px" className="flex-shrink-0" />
        </div>
      ))}
    </Panel>
  );
}

// Re-export the row type for callers that need it.
export type { StaffRow as StaffPickerRow };
