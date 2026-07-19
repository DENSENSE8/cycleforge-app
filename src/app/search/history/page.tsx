/**
 * /search/history — legacy recents archive. Canonical home is Dashboard Search
 * mode (`/dashboard?mode=search`), whose sidebar lists per-staff recents.
 */

import { redirect } from 'next/navigation';

export default function SearchHistoryPage() {
  redirect('/dashboard?mode=search');
}
