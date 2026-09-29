import { redirect } from 'next/navigation';

/** `/tracking-exceptions` — moved: Inventory › Tracking Exceptions is the Exceptions hub list locked to Tracking. */
export default function TrackingExceptionsPage() {
  redirect('/inventory/triage');
}
