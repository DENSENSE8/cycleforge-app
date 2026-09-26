import type { Metadata } from 'next';
import { Suspense } from 'react';
import { WorkOrderCalendar } from '@/components/work-orders/calendar/WorkOrderCalendar';

export const metadata: Metadata = {
  title: 'Scheduling Calendar',
};

/** P3-ADM-03 — Scheduling / staff-assignment calendar. */
export default function CalendarPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <Suspense>
        <WorkOrderCalendar />
      </Suspense>
    </main>
  );
}
