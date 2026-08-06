/**
 * Station terminal registry — declarative tab → kind maps per workspace mode.
 *
 * Kind strings (`mode-default`, `po-note`, `none`) are resolved into
 * TerminalActionVm by mode-specific builders under each panel's `terminal/`
 * folder. This file never builds icons or handlers.
 */

import type { ModeTerminalSliceDef, TerminalWorkspaceMode } from './types';

export const STATION_TERMINAL_REGISTRY: Record<TerminalWorkspaceMode, ModeTerminalSliceDef> = {
  unbox: {
    // Carton-terminal: the Unbox dock is always Print · Receive. The displays
    // moved to the right-edge Displays push column (Lane E), so a tab → kind map
    // would mean a right-panel click silently re-labelling the bottom primary.
    // Tab-scoped actions are local controls inside their own display now.
    hasSectionTabs: false,
    defaultKind: 'mode-default',
    tabs: {},
  },
  triage: {
    hasSectionTabs: true,
    defaultKind: 'mode-default',
    tabs: {
      overview: 'mode-default',
      staging: 'mode-default',
      pairing: 'mode-default',
    },
  },
  testing: {
    // Carton-terminal: Pass · Print always. Ticket replies stay inline in the
    // Ticket Displays body — a right-panel click must not re-label the dock
    // (Unbox grammar). Middle dock = label / item notes only.
    hasSectionTabs: false,
    defaultKind: 'mode-default',
    tabs: {},
  },
  shipping: {
    hasSectionTabs: true,
    // Preview (Up Next) uses defaultKind with tabId null → Start CTA.
    // Active scan tabs stay `none` (scan-driven; no sticky CTA on ship/units).
    defaultKind: 'start',
    tabs: {
      ship: 'none',
      units: 'none',
      timeline: 'none',
    },
  },
  repair: {
    hasSectionTabs: false,
    defaultKind: 'mode-default',
    tabs: {},
  },
  pickup: {
    hasSectionTabs: true,
    tabs: {
      item: 'mode-default',
      add: 'add-item',
    },
  },
};

export function getTerminalSlice(mode: TerminalWorkspaceMode): ModeTerminalSliceDef {
  return STATION_TERMINAL_REGISTRY[mode];
}
