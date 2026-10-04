'use client';

/**
 * Mobile receiving feed — `/m/receiving`. THE phone inbound surface.
 *
 * This is the shared {@link MobileReceivingList} — the same feed the desktop
 * `/receiving` "Unboxing" rail uses — and nothing else.
 *
 * It used to branch on `?mode=`: `local-pickup` and `repair` each rendered a
 * "starter" card whose whole content was an instruction to go and use a
 * desktop station ("Log a repair from the desktop walk-in station"). That is
 * the refusal `docs/mobile-first/SURFACE_LAW.md` §10 names outright — a phone
 * surface that cannot complete its verb is not a surface, it is a sign — and
 * operator 2026-09-15 removed the rows that reached them: *"remove the inbound
 * walk-in, consult, repair and unbox — just keep the photo feed only."*
 *
 * So there is no `mode` prop. If local pickup or repair earn a phone surface,
 * they get a real one under `/m` with a completable job, not a branch here.
 *
 * The header lives in the shell; the body runs to the bottom (shell `pb-safe`).
 *
 * Above the feed sits ONE control strip: the window size and a `View all`
 * door to `/m/receiving/history` (search · status facets · 200 rows). The
 * feed is bottom-anchored — newest at the bottom, older scrolling UP — so
 * past {@link FEED_LIMIT} there was no way off the window at all. The strip
 * lives here rather than in {@link MobileReceivingList} because that feed is
 * also the Arrival station body (`surface="triage"`), which has its own
 * scan-first chrome and must not grow a second door.
 */

import Link from 'next/link';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { Camera } from '@/components/Icons';
import { MobileReceivingList } from '@/components/mobile/receiving/MobileReceivingList';

/** Rows kept in the live window. Named so the strip copy cannot drift from it. */
const FEED_LIMIT = 25;

export default function MobileV2ReceivingLive() {
  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${appMobilePageGroundClass}`}>
      <div className="flex shrink-0 items-center justify-between border-b border-border-hairline px-4">
        <p className="text-role-caption font-semibold uppercase tracking-[0.18em] text-text-muted">
          Latest {FEED_LIMIT}
        </p>
        <div className="flex items-center gap-4">
          {/* The unopened-carton queue — its own screen (one job per screen). */}
          <Link
            href="/m/unbox"
            prefetch={false}
            className="inline-flex min-h-11 items-center text-role-caption font-semibold uppercase tracking-wider text-text-default active:text-text-muted"
          >
            Unbox next
          </Link>
          <Link
            href="/m/receiving/pickup"
            prefetch={false}
            className="inline-flex min-h-11 items-center gap-1.5 text-role-caption font-semibold uppercase tracking-wider text-text-default active:text-text-muted"
          >
            <Camera aria-hidden className="h-4 w-4" /> Pickup
          </Link>
          <Link
            href="/m/receiving/history"
            prefetch={false}
            className="inline-flex min-h-11 items-center text-role-caption font-semibold uppercase tracking-wider text-text-muted active:text-text-default"
          >
            View all
          </Link>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <MobileReceivingList limit={FEED_LIMIT} />
      </div>
    </div>
  );
}
