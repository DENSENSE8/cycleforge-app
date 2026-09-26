import type { ReactNode } from 'react';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

/** `/operations` — the Operations **desk** frame (2026-08-31). */
export default function OperationsLayout({ children }: { children: ReactNode }) {
  return <DeskPageLayout className="h-full">{children}</DeskPageLayout>;
}
