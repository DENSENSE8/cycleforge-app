/** Station terminal registry — declarative tab → kind maps per workspace mode. */

import type { ModeTerminalSliceDef, TerminalWorkspaceMode } from './types';

export const STATION_TERMINAL_REGISTRY: Record<TerminalWorkspaceMode, ModeTerminalSliceDef> = {
  unbox: {
    // Carton-terminal:
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
    // Centre Pack pairing is not a SectionTabsSlider; hasSectionTabs stays true
    // so preview Start still resolves when tabId is null.
    hasSectionTabs: true,
    // Preview (Up Next) uses defaultKind with tabId null → Start CTA.
    // Active Pack centre is scan-driven (`none`); Units is a Displays leaf.
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
