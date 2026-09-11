/**
 * /m/triage — retired as a named Arrival station. Identification lives on /m/scan.
 */

import { redirect } from 'next/navigation';

export default function MobileTriageRedirectPage() {
  redirect('/m/scan');
}
