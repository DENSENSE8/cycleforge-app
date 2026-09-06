/**
 * /workstation — the desk's triage window onto the phone (2026-09-06).
 *
 * Mobile-first, not mobile-only: the real `/m/triage` surface in a 390×844
 * frame beside the day's timeline, readable at desk distance. See
 * `WorkstationDesk` for the shape. Deliberately NOT added to the spine —
 * desktop nav integration is a separate ruling; the route is reachable by URL.
 */

import { WorkstationDesk } from '@/components/desktop/workstation/WorkstationDesk';

export const metadata = { title: 'Workstation' };

export default function WorkstationPage() {
  return <WorkstationDesk />;
}
