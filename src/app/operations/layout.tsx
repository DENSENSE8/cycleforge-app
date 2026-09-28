import type { ReactNode } from 'react';
import { OperationsDeskFrame } from '@/features/operations/OperationsDeskFrame';

/** `/operations` — the Operations **desk** frame (2026-08-31); Imports runs on the contextual sidebar. */
export default function OperationsLayout({ children }: { children: ReactNode }) {
  return <OperationsDeskFrame>{children}</OperationsDeskFrame>;
}
