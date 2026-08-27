import type { IncomingAddInitialLeaf } from './IncomingAddInboundOverlay';

/** Single RightRailHost occupant for Incoming desk Band-1 tools. */
export const INCOMING_DESK_RAIL_ID = 'detail:incoming-desk-tools';

export type IncomingDeskRailTool =
  | { kind: 'check'; checkOnly?: boolean }
  | { kind: 'filter' }
  | {
      kind: 'add';
      orderId?: string;
      platform?: string;
      leaf?: IncomingAddInitialLeaf;
    };

export function incomingDeskRailAriaLabel(tool: IncomingDeskRailTool): string {
  switch (tool.kind) {
    case 'check':
      return 'Checking unreceived orders';
    case 'filter':
      return 'Tracking list';
    case 'add':
      return 'Add inbound purchase or return';
  }
}
