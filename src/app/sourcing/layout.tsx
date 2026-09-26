import type { ReactNode } from 'react';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

/** `/sourcing` — the Sourcing **desk** frame (2026-08-31). */
export default function SourcingLayout({ children }: { children: ReactNode }) {
  return <DeskPageLayout className="h-full">{children}</DeskPageLayout>;
}
