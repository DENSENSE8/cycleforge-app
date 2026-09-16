'use client';

/**
 * `/m/reports` — the manager's read of a shift.
 *
 * A route shell: it owns the PERMISSION and mounts
 * {@link MobileStaffDayReport}. Gated on `operations.view` (the Monitor lane's
 * own permission, and tighter than `reports.view`, which the viewer role also
 * holds) because reading a PEER's day is a lead's job (operator 2026-09-15:
 * *"view only in a manager"*) — a floor staffer reads their own day on
 * `/m/home`, where the checklist already shows their ticks.
 *
 * The drawer drops the Reports row for the same permission, so this screen is
 * normally unreachable without it; the check here is the direct-link case, and
 * it answers in words rather than a blank page.
 *
 * **Known gap, deliberate and worth an operator ruling:** the DATA behind this
 * screen — `GET /api/daily-checks?date=` — is gated `dashboard.view`, i.e.
 * everyone who can open the app, and it has always returned the whole roster
 * because `/m/home` needs the day's report to paint the shift fraction. So this
 * is a DOOR gate, not a data gate: it stops the surface, not a hand-rolled
 * fetch. Closing it properly means either a `reports.view` projection endpoint
 * or narrowing the report route's payload by permission — both are their own
 * increment (Track R3), and neither should be smuggled in here.
 */

import { useAuth } from '@/contexts/AuthContext';
import { MobileReportsView } from '@/components/mobile/reports/MobileReportsView';

export default function MobileReportsPage() {
  const { has, isLoaded } = useAuth();

  if (!isLoaded) {
    return <p className="px-4 pt-6 text-role-caption text-text-muted">Loading…</p>;
  }

  if (!has('operations.view')) {
    return (
      <p role="alert" className="px-4 pt-6 text-role-caption text-text-muted">
        Reports are for leads. Your own day is on Daily.
      </p>
    );
  }

  return <MobileReportsView />;
}
