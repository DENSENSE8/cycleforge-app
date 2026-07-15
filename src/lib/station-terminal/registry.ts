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
      tracking: 'tracking',
      ticket: 'ticket',
      conversation: 'conversation',
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
      // Resolved further in TestingPanel → claim-reply | file-claim | none
      claim: 'claim',
    },
  },
  shipping: {
    hasSectionTabs: true,
    // No workspace dock yet — scan-driven. Registered so the guard stays
    // complete when ShippingScanWorkspace later adds a scan-complete CTA.
    defaultKind: 'none',
    tabs: {
      ship: 'none',
      units: 'none',
    },
  },
};

export function getTerminalSlice(mode: TerminalWorkspaceMode): ModeTerminalSliceDef {
  return STATION_TERMINAL_REGISTRY[mode];
}
