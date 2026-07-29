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
  modal,
  ariaLabel,
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
  /** `false` = non-modal inspector (no scrim / scroll lock; `role="region"`).
   *  Defaults to modal so existing occupants are unchanged. */
  modal?: boolean;
  /** Accessible name for the aside — pass one whenever `modal` is false. */
  ariaLabel?: string;
  children: ReactNode;
}) {
  useRegisterRightPanel({
    id,
    priority: RIGHT_RAIL_PRIORITY.detail,
    node: children,
    onClose,
    elevated,
    modal,
    ariaLabel,
    enabled,
  });
  return null;
}
