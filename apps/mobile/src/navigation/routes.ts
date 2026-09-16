export const TABLET_BREAKPOINT = 768;

export const MOBILE_MODULES = [
  { key: 'FieldAcquisitions', label: 'Field Acquisitions', sessionLabel: 'Recent Acquisitions', workspaceLabel: 'Active Entry', contextLabel: 'Customer & Payout' },
  { key: 'Receiving', label: 'Receiving', sessionLabel: 'Pending Purchase Orders', workspaceLabel: 'PO Discrepancy Log', contextLabel: 'Vendor Details' },
  { key: 'PickLists', label: 'Pick Lists', sessionLabel: 'Priority Batches', workspaceLabel: 'Active Bin Pick', contextLabel: 'Order Manifest' },
  { key: 'PackShip', label: 'Pack & Ship', sessionLabel: 'QA Queue', workspaceLabel: 'Box Scan & Label', contextLabel: 'Carrier Overrides' },
  { key: 'ItemLookup', label: 'Item Lookup', sessionLabel: 'Saved & Recent SKUs', workspaceLabel: 'Scanner Interface', contextLabel: 'Global Stock Levels' },
  { key: 'BinTransfers', label: 'Bin Transfers', sessionLabel: 'Active Transfers', workspaceLabel: 'Relocation Tool', contextLabel: 'Bin Velocity Stats' },
  { key: 'ScanHistory', label: 'Scan History', sessionLabel: 'Time-Grouped Sessions', workspaceLabel: 'Chronological Scan Feed', contextLabel: 'Raw Payload & Debug' },
  { key: 'WorkspaceSettings', label: 'Workspace Settings', sessionLabel: 'Tenants', workspaceLabel: 'Configuration Toggles', contextLabel: 'Billing & API Keys' },
] as const;

export type ModuleKey = (typeof MOBILE_MODULES)[number]['key'];
export type ModuleDefinition = (typeof MOBILE_MODULES)[number];

export type RootDrawerParamList = { [K in ModuleKey]: undefined };
export type RootTabParamList = RootDrawerParamList;

export type ModuleStackParamList = {
  SessionList: { moduleKey: ModuleKey };
  ActiveWorkspace: { moduleKey: ModuleKey; sessionId?: string };
  ContextPanel: { moduleKey: ModuleKey };
};

export function getModuleDefinition(key: ModuleKey): ModuleDefinition {
  const module = MOBILE_MODULES.find((candidate) => candidate.key === key);
  if (!module) throw new Error(`Unknown mobile module: ${key}`);
  return module;
}
