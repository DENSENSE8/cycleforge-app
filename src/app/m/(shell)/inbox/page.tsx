'use client';

/**
 * `/m/inbox` — the phone's Home inbox.
 *
 * A route shell: it owns the PERMISSION and mounts {@link MobileInboxView}.
 * Gated on `home.inbox.view`, the same permission `GET /api/inbox` and
 * `PATCH /api/inbox/[id]` carry, so the door and the data agree.
 *
 * The drawer drops the Inbox row for the same permission, so this screen is
 * normally unreachable without it; the check here is the direct-link case, and
 * it answers in words rather than a blank page.
 *
 * Why the screen exists at all: the desk header inbox came back 2026-09-22 with
 * the "watch a tracking number" control inside it, and `SURFACE_LAW` §1 refuses
 * a desk-only surface without a `/m` twin or a recorded exception. This is the
 * twin — and it is the more natural home for the verb, since the number is
 * usually read off a phone and the carton is always scanned with one.
 */

import { useAuth } from '@/contexts/AuthContext';
import { MobileInboxView } from '@/components/mobile/inbox/MobileInboxView';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

export default function MobileInboxPage() {
  const { has, isLoaded } = useAuth();

  if (!isLoaded) {
    return <p className="px-4 pt-6 text-role-caption text-text-muted">Loading…</p>;
  }

  if (!has('home.inbox.view')) {
    return (
      <p role="alert" className="px-4 pt-6 text-role-caption text-text-muted">
        Your account cannot open the inbox. Ask a lead to grant it.
      </p>
    );
  }

  return (
    <ModeRegion mode="triage" className="contents">
      <MobileInboxView />
    </ModeRegion>
  );
}
