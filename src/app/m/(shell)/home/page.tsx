'use client';

/**
 * `/m/home` — Daily, the phone face of the shift checklist.
 *
 * This URL was a redirect stub (→ `/m/work`) after the 2026-09-14 mobile
 * deletion pass, and it is **load-bearing infrastructure**: the QR handoff
 * claim redirect, the claim page fallback, signin's role-home + fallback,
 * `DesktopRouteShell`'s phone bounce off desktop-only paths, and
 * `LandingPageCard`'s mobile default all land here. It must never 404 — it now
 * resolves to a real surface instead of bouncing, which is what the landing
 * contract always wanted.
 *
 * The desk at `/` renders the same data through the slot table; this is the
 * mobile SoT for the check verb (SURFACE_LAW).
 */

import { MobileDailyChecklist } from '@/components/mobile/daily/MobileDailyChecklist';

export default function MobileDailyPage() {
  return <MobileDailyChecklist />;
}
