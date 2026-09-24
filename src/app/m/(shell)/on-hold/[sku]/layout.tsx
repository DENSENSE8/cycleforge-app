'use client';

import type { ReactNode } from 'react';
import { useSkuExceptionsRealtime } from '@/hooks/useProvisionalSkus';

/**
 * One subscription for every screen of a SKU exception (hub, details, photos,
 * locations, pair): a change from any device invalidates `qk.skuExceptions`,
 * which is what lets the record read stay cached across hub ↔ screen moves.
 */
export default function SkuExceptionLayout({ children }: { children: ReactNode }) {
  useSkuExceptionsRealtime();
  return children;
}
