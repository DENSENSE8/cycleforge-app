/** Settings Registry — the single source of truth for configurable behavior. */

import { z } from 'zod';
import { parsePhotoAspectList } from '@/lib/photos/photo-aspects';
import { ALL_ROLES } from '@/lib/auth/permissions-shared';
import type { SettingDef, SettingPage } from './types';
import { ORDER_LIST_VIEW_KEYS, VIEW_SPECS, type Density, type OrderListViewKey } from '@/lib/views/view-specs';

/** Per-role override of the Unbox Inbound pin default (Gemini D9). */
const UNBOX_ROLE_DEFAULT_SETTINGS: readonly SettingDef[] = ALL_ROLES.map((role) => ({
  key: `receiving.unboxDefaultPinnedByRole.${role}`,
  page: 'receiving' as const,
  group: 'Unbox strip',
  scope: 'org' as const,
  advanced: true,
  label: `Pin Inbound for ${role.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}`,
  control: 'select' as const,
  schema: z.enum(['inherit', 'on', 'off']).default('inherit'),
  options: [
    { value: 'inherit', label: 'Inherit org default' },
    { value: 'on', label: 'Pinned' },
    { value: 'off', label: 'Not pinned' },
  ],
  permission: 'admin.manage_features',
}));

/**
 * Desks whose record view (In place / Split) is remembered, by `SIDEBAR_PAGE_NAV` page id (what `useActiveSidebarChild().pageId` resolves on a…
 * (`DeskRecordPlane`, operator 2026-09-25) — so it sticks per staffer, per
 * desk. Floor is a session posture and is never stored (owner 2026-09-26).
 */
const DESK_VIEW_DESKS = [
  { id: 'home', label: 'Tasks' },
  { id: 'outbound', label: 'FBM' },
  { id: 'fba', label: 'FBA' },
  { id: 'incoming', label: 'Deliveries' },
  { id: 'receive', label: 'Unbox' },
  { id: 'repair', label: 'Repair Service' },
  { id: 'operations', label: 'Operations' },
  { id: 'products', label: 'Products' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'sourcing', label: 'Sourcing' },
  { id: 'support', label: 'Support' },
  { id: 'sales', label: 'Sales' },
] as const;

/** Storage key of one desk's remembered record view. */
export function deskViewSettingKey(deskId: string): string {
  return `desk.${deskId}.view`;
}

const DESK_VIEW_SETTINGS: readonly SettingDef[] = DESK_VIEW_DESKS.map((desk) => ({
  key: deskViewSettingKey(desk.id),
  page: 'desk' as const,
  group: 'Record view',
  scope: 'staff' as const,
  label: `${desk.label}: record view`,
  description:
    'Remembered from the one In place · Split · Floor view switch (Floor is never remembered). In place: a record opens where the list is. Split: list left, record right.',
  control: 'segmented' as const,
  schema: z.enum(['in-place', 'split']).default('in-place'),
  options: [
    { value: 'in-place', label: 'In place' },
    { value: 'split', label: 'Split' },
  ],
  // Before 2026-09-26 the choice was a boolean `desk.<id>.fullscreen` (on = Split).
  legacy: {
    key: `desk.${desk.id}.fullscreen`,
    read: (raw: unknown) => (raw === true ? 'split' : raw === false ? 'in-place' : undefined),
  },
}));

/** Storage key of one list view's remembered row density (`VIEW_SPECS[viewKey].density`). */
export function viewDensitySettingKey(viewKey: OrderListViewKey): string {
  return `desk.${viewKey}.density`;
}

const DENSITY_LABEL: Record<Density, string> = { S: 'Small', M: 'Medium', L: 'Large' };

/** One row-density setting per list view, bounded by the view's allowed range. */
const VIEW_DENSITY_SETTINGS: readonly SettingDef[] = ORDER_LIST_VIEW_KEYS.map((viewKey) => {
  const { density, job } = VIEW_SPECS[viewKey];
  return {
    key: viewDensitySettingKey(viewKey),
    page: 'desk' as const,
    group: 'Row density',
    scope: 'staff' as const,
    label: `${viewKey}: row density`,
    description: `${job} — the row size this view opens at.`,
    control: 'segmented' as const,
    schema: z.enum(density.allowed as [Density, ...Density[]]).default(density.default),
    options: density.allowed.map((value) => ({ value, label: DENSITY_LABEL[value] })),
  };
});

/** The Tasks board's pinned Daily checklist column, shown or hidden per staffer (`H` on `/`). */
export const TASK_BOARD_CHECKLIST_COLUMN_SETTING = 'desk.home.checklistColumn';

export const SETTING_PAGES = [
  { id: 'receiving', label: 'Receiving', description: 'Unboxing & intake behavior' },
  { id: 'scan', label: 'Scan feedback', description: 'Tones and buzzes on a scan, at every station' },
  { id: 'desk', label: 'Desks', description: 'How each desk shows its records' },
] as const satisfies readonly { id: SettingPage; label: string; description: string }[];

export const SETTINGS: readonly SettingDef[] = [
  // ─── Organization · Photos ──────────────────────────────────────────────
  {
    key: 'receiving.photoPolicy',
    page: 'receiving',
    group: 'Photos',
    scope: 'org',
    label: 'Photo requirement',
    description: 'Whether unboxing photos are required before a line can be marked received.',
    control: 'segmented',
    schema: z.enum(['optional', 'require_one', 'require_per_item']).default('optional'),
    options: [
      { value: 'optional', label: 'Optional', hint: 'Photos never block.' },
      { value: 'require_one', label: 'Require one', hint: 'At least one photo per carton.' },
      { value: 'require_per_item', label: 'Per item', hint: 'A photo for every line.' },
    ],
    permission: 'admin.manage_features',
  },
  {
    key: 'receiving.nasBackup',
    page: 'receiving',
    group: 'Photos',
    scope: 'org',
    label: 'NAS backup',
    description: 'How receiving photos are archived to the office NAS.',
    control: 'segmented',
    schema: z.enum(['off', 'mirror', 'direct']).default('mirror'),
    options: [
      { value: 'off', label: 'Off', hint: 'No NAS copy.' },
      { value: 'mirror', label: 'Mirror', hint: 'Background copy from cloud storage.' },
      { value: 'direct', label: 'Direct', hint: 'Browser writes straight to the NAS.' },
    ],
    optionEntitlements: { direct: 'nasArchive' },
    permission: 'admin.manage_features',
  },
  {
    key: 'receiving.requiredItemPhotoAspects',
    page: 'receiving',
    group: 'Photos',
    scope: 'org',
    label: 'Required item photo angles',
    description:
      'Which item shots must exist before the Item photos step is complete. Comma-separated: included, serial, front, back, side, bottom. Empty means any item photo counts.',
    control: 'text',
    // A comma list rather than six toggles or a multi-select:
    schema: z
      .string()
      .trim()
      .refine(
        (raw) => raw === '' || parsePhotoAspectList(raw).length > 0,
        'must be a comma-separated list of item photo angles (included, serial, front, back, side, bottom)',
      )
      .default('included,serial'),
    permission: 'admin.manage_features',
  },
  {
    key: 'receiving.unboxFlowCaptureOrder',
    page: 'receiving',
    group: 'Procedure',
    scope: 'org',
    label: 'Unbox step order (per flow)',
    description:
      'Dogfood: capture-step order for Found / Unfound / Return flows as JSON. Edited from the Unbox right-rail checklist via drag-and-drop — do not hand-edit unless you know the step keys.',
    control: 'text',
    // Org-scope write permission (registry law). Floor dogfood DnD still goes
    // through the settings write path gated by this permission.
    schema: z
      .string()
      .trim()
      .refine((raw) => {
        if (raw === '') return true;
        try {
          const v = JSON.parse(raw) as unknown;
          return !!v && typeof v === 'object' && !Array.isArray(v);
        } catch {
          return false;
        }
      }, 'must be a JSON object of flow id → step key arrays')
      .default('{}'),
    // Floor operators who mark received can dogfood the right-rail reorder;
    // admin.manage_features would lock SOP edits to admins only.
    permission: 'receiving.mark_received',
    advanced: true,
  },
  {
    key: 'receiving.autoPushPhoneCamera',
    page: 'receiving',
    group: 'Photos',
    scope: 'org',
    personalizable: true,
    label: 'Open phone camera on scan',
    description: 'When a tracking scan matches, auto-open the paired phone camera for photos.',
    control: 'toggle',
    schema: z.boolean().default(true),
    permission: 'admin.manage_features',
  },

  // ─── Organization · Claims ──────────────────────────────────────────────
  {
    key: 'receiving.autoTicket',
    page: 'receiving',
    group: 'Claims',
    scope: 'org',
    label: 'Auto-create support ticket',
    description: 'Automatically open a Zendesk claim on certain receiving outcomes.',
    control: 'segmented',
    schema: z.enum(['off', 'on_qa_fail', 'on_unfound']).default('off'),
    options: [
      { value: 'off', label: 'Off' },
      { value: 'on_qa_fail', label: 'On QA fail' },
      { value: 'on_unfound', label: 'On unfound' },
    ],
    entitlement: 'automations',
    permission: 'admin.manage_features',
    comingSoon: true,
  },

  // ─── Organization · Putaway / Labels / Safety ───────────────────────────
  {
    key: 'receiving.defaultPutawayBin',
    page: 'receiving',
    group: 'Putaway',
    scope: 'org',
    label: 'Default putaway bin',
    description: 'Bin barcode used when a unit is received without a scanned destination.',
    control: 'text',
    schema: z.string().trim().min(1).max(64).default('UNSORTED'),
    permission: 'admin.manage_features',
  },
  {
    key: 'receiving.returnsTestBin',
    page: 'receiving',
    group: 'Putaway',
    scope: 'org',
    label: 'Returns testing bin',
    description:
      'Bin barcode that return cartons auto-stage into when scanned at receiving. Printable as a 2×1 special-bin label.',
    control: 'text',
    schema: z.string().trim().min(1).max(64).default('RETURNS-TEST'),
    permission: 'admin.manage_features',
  },
  {
    key: 'receiving.autoPrintLabel',
    page: 'receiving',
    group: 'Labels',
    scope: 'org',
    label: 'Auto-print label on receive',
    description: 'Print the internal label automatically when a line is marked received.',
    control: 'toggle',
    schema: z.boolean().default(false),
    permission: 'admin.manage_features',
  },
  {
    key: 'receiving.confirmSerialRemoval',
    page: 'receiving',
    group: 'Safety',
    scope: 'org',
    label: 'Confirm before removing a serial',
    description: 'Show a confirmation prompt when an operator deletes a scanned serial.',
    control: 'toggle',
    schema: z.boolean().default(true),
    permission: 'admin.manage_features',
  },
  {
    key: 'receiving.requireSerialConfirmation',
    page: 'receiving',
    group: 'Safety',
    scope: 'org',
    label: 'Require serial confirmation to receive',
    description:
      'Block Receive until the operator either captures a serial or explicitly marks the item as having no serial number.',
    control: 'toggle',
    schema: z.boolean().default(false),
    permission: 'admin.manage_features',
  },

  // ─── Organization · Unbox strip ─────────────────────────────────────────
  {
    key: 'receiving.unboxDefaultPinnedExtraTabs',
    page: 'receiving',
    group: 'Unbox strip',
    scope: 'org',
    label: 'Pin Inbound on the Unbox strip by default',
    description:
      'New staff see the Inbound (incoming POs) list pinned on the Unbox strip until they change it. Anyone can still pin or unpin their own strip.',
    // v1 the pin catalog is Inbound-only, so the org default is a single toggle (SettingValue is a primitive).
    control: 'toggle',
    schema: z.boolean().default(false),
    permission: 'admin.manage_features',
  },
  // Per-role overrides (Inherit · Pinned · Not pinned) — one advanced `select`
  // per role. Set by admins; folded role→org server-side (D9).
  ...UNBOX_ROLE_DEFAULT_SETTINGS,

  // ─── Organization · Vision (advanced, plan-gated) ───────────────────────
  {
    key: 'receiving.vision.consensusNeeded',
    page: 'receiving',
    group: 'Vision',
    scope: 'org',
    advanced: true,
    label: 'Label OCR consensus',
    description: 'How many matching reads lock a label scan.',
    control: 'number',
    schema: z.number().int().min(1).max(5).default(2),
    min: 1,
    max: 5,
    step: 1,
    unit: 'reads',
    entitlement: 'advancedVision',
    permission: 'admin.manage_features',
  },
  {
    key: 'receiving.vision.scanIntervalMs',
    page: 'receiving',
    group: 'Vision',
    scope: 'org',
    advanced: true,
    label: 'Label OCR scan interval',
    description: 'Delay between live label-scan frames.',
    control: 'number',
    schema: z.number().int().min(120).max(1000).default(280),
    min: 120,
    max: 1000,
    step: 20,
    unit: 'ms',
    entitlement: 'advancedVision',
    permission: 'admin.manage_features',
  },
  {
    key: 'receiving.vision.sendMaxDim',
    page: 'receiving',
    group: 'Vision',
    scope: 'org',
    advanced: true,
    label: 'Vision frame resolution',
    description: 'Max dimension of frames sent to the LAN vision box.',
    control: 'number',
    schema: z.number().int().min(640).max(2400).default(1600),
    min: 640,
    max: 2400,
    step: 80,
    unit: 'px',
    entitlement: 'advancedVision',
    permission: 'admin.manage_features',
  },

  // ─── Personal (+ org default) · Scanning ────────────────────────────────
  {
    key: 'receiving.defaultScanMode',
    page: 'receiving',
    group: 'Scanning',
    scope: 'org',
    personalizable: true,
    label: 'Default scan mode',
    description: 'Which mode the unbox scan bar arms on open.',
    control: 'segmented',
    schema: z.enum(['tracking', 'order']).default('tracking'),
    options: [
      { value: 'tracking', label: 'Tracking #' },
      { value: 'order', label: 'Order #' },
    ],
    permission: 'admin.manage_features',
  },
  {
    key: 'receiving.autoFocusSerial',
    page: 'receiving',
    group: 'Scanning',
    scope: 'staff',
    label: 'Auto-focus serial after scan',
    description: 'Move the cursor to the serial field as soon as a tracking scan resolves.',
    control: 'toggle',
    schema: z.boolean().default(true),
  },
  {
    key: 'receiving.autoAdvanceSerial',
    page: 'receiving',
    group: 'Scanning',
    scope: 'staff',
    label: 'Auto-advance to next serial',
    description: 'After a serial is entered, jump to the next empty slot.',
    control: 'toggle',
    schema: z.boolean().default(true),
  },

  // ─── Scan feedback — every station (useScanFeedback) ────────────────────
  // Moved off the receiving page (Phase E): the stored receiving.* values keep
  // resolving through `legacy` until the first write lands on the new key.
  {
    key: 'scan.soundsEnabled',
    page: 'scan',
    group: 'Sound',
    scope: 'org',
    label: 'Scan sounds',
    description: 'Master switch for scan tones at every station. Operators can still opt out individually.',
    control: 'toggle',
    schema: z.boolean().default(false),
    permission: 'admin.manage_features',
    legacy: { key: 'receiving.scanSoundsEnabled', read: (raw) => raw },
  },
  {
    key: 'scan.sound',
    page: 'scan',
    group: 'Sound',
    scope: 'staff',
    label: 'Scan sound',
    description: 'Play a tone when a scan lands or is refused, at every station (needs the org switch on).',
    control: 'toggle',
    schema: z.boolean().default(true),
    legacy: { key: 'receiving.scanSound', read: (raw) => raw },
  },
  {
    key: 'scan.haptics',
    page: 'scan',
    group: 'Haptics',
    scope: 'staff',
    label: 'Scan haptics',
    description: 'Buzz the phone on a scan and on a dock press (supported devices only).',
    control: 'toggle',
    // On by default: phone stations buzzed unconditionally before the switch applied to them.
    schema: z.boolean().default(true),
    legacy: { key: 'receiving.scanHaptics', read: (raw) => raw },
  },

  // ─── Personal · Layout ──────────────────────────────────────────────────
  {
    key: 'receiving.defaultLandingMode',
    page: 'receiving',
    group: 'Layout',
    scope: 'staff',
    label: 'Default landing mode',
    description: 'Which receiving mode opens first.',
    control: 'select',
    schema: z.enum(['receive', 'incoming', 'triage', 'pickup', 'history']).default('receive'),
    options: [
      { value: 'receive', label: 'Unbox' },
      { value: 'incoming', label: 'Inbound' },
      { value: 'triage', label: 'Arrival' },
      { value: 'pickup', label: 'Local pickup' },
      { value: 'history', label: 'History' },
    ],
  },
  {
    key: 'receiving.accordionExpand',
    page: 'receiving',
    group: 'Layout',
    scope: 'staff',
    label: 'Carton lines on open',
    description: 'Expand just the active line or every line when a carton opens.',
    control: 'segmented',
    schema: z.enum(['active', 'all']).default('active'),
    options: [
      { value: 'active', label: 'Active only' },
      { value: 'all', label: 'Expand all' },
    ],
  },
  {
    key: TASK_BOARD_CHECKLIST_COLUMN_SETTING,
    page: 'desk',
    group: 'Tasks board',
    scope: 'staff',
    label: 'Tasks: Daily checklist column',
    description: 'Pin today’s checklist as the left-most column of the Tasks board. H on the board hides or shows it.',
    control: 'toggle',
    schema: z.boolean().default(true),
  },
  ...DESK_VIEW_SETTINGS,
  ...VIEW_DENSITY_SETTINGS,
];

const BY_KEY = new Map<string, SettingDef>(SETTINGS.map((s) => [s.key, s]));

export function settingByKey(key: string): SettingDef | undefined {
  return BY_KEY.get(key);
}

export function settingsForPage(page: SettingPage): SettingDef[] {
  return SETTINGS.filter((s) => s.page === page);
}

export function isSettingPage(raw: unknown): raw is SettingPage {
  return typeof raw === 'string' && SETTING_PAGES.some((p) => p.id === raw);
}
