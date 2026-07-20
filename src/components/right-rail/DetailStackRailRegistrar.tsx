'use client';

/**
 * DetailStackRailRegistrar — registers geometry-free detail content with the
 * single `RightRailHost` slot. Returns null; the host renders the global
 * `DetailStackFrame` around `children`.
 */

import type { ReactNode } from 'react';
import { useRegisterRightPanel } from '@/components/right-rail/useRegisterRightPanel';
import { RIGHT_RAIL_PRIORITY } from '@/lib/right-rail/store';

export function DetailStackRailRegistrar({
  id,
  onClose,
  enabled = true,
  elevated,
  children,
}: {
  /** Stable occupant id — doubles as the AnimatePresence key in RightRailHost. */
  id: string;
  onClose: () => void;
  enabled?: boolean;
  /** When true, render in the elevated `detailStack` band (above a workbench
   *  workspace overlay) + a deeper backdrop. Use for detail stacks that open
   *  over a `panel`-band workspace (receiving Unbox/Triage). */
  elevated?: boolean;
  children: ReactNode;
}) {
  useRegisterRightPanel({
    id,
    priority: RIGHT_RAIL_PRIORITY.detail,
    node: children,
    onClose,
    elevated,
    enabled,
  });
  return null;
}
