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
    hasSectionTabs: true,
    tabs: {
      overview: 'mode-default',
      'po-note': 'po-note',
      checklist: 'checklist',
      units: 'units',
      timeline: 'timeline',
      ticket: 'ticket',
      support: 'support',
    },
  },
  triage: {
    hasSectionTabs: false,
    defaultKind: 'mode-default',
    tabs: {},
  },
  testing: {
    hasSectionTabs: true,
    defaultKind: 'mode-default',
    tabs: {
      testing: 'mode-default',
      pairing: 'mode-default',
      checklist: 'mode-default',
      manuals: 'mode-default',
      // Resolved further in TestingPanel → file-claim | none
      ticket: 'ticket',
      timeline: 'none',
    },
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
