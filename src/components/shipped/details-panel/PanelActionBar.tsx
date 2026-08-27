/**
 * Shipped-details action-bar prop shape.
 *
 * The former {@code PanelActionBar} adapter was retired — stacks receive this
 * config but discard it (`_actionBar`); close / prev / next live on
 * {@link PaneHeaderActionBar} / RightRailHost. The type remains so stack props
 * and {@link ShippedDetailsBody} stay typed without a second prop bag.
 */

import type { PanelAction } from '@/hooks/usePanelActions';

export interface PanelActionBarConfig {
  /** Retained for back-compat; close lives on RightRailHost (backdrop / Esc). */
  onClose?: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAssign?: () => void;
  disableMoveUp?: boolean;
  disableMoveDown?: boolean;
  disableAssign?: boolean;
  actions?: PanelAction[];
}
