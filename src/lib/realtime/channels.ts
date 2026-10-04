/** Ably channel names — ORG-NAMESPACED. */

const DEFAULT_ORDERS_CHANNEL = 'orders:changes';
const DEFAULT_REPAIRS_CHANNEL = 'repair:changes';
const DEFAULT_AI_ASSIST_CHANNEL = 'ai:assist';
const DEFAULT_STATION_CHANNEL = 'station:changes';
const DEFAULT_STAFF_CHANNEL = 'staff:changes';
const DEFAULT_DB_CHANNEL_PREFIX = 'db';
const DEFAULT_FBA_CHANNEL = 'fba:changes';
const DEFAULT_DASHBOARD_CHANNEL = 'dashboard:operations';
const DEFAULT_OPS_PLANS_CHANNEL = 'ops_plans:changes';
const DEFAULT_WALKIN_CHANNEL = 'walkin:changes';
const DEFAULT_MASTER_PLAN_CHANNEL = 'forge:master-plan';
const DEFAULT_FORGE_RUNS_CHANNEL = 'forge:runs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeChannelName(value: string | undefined | null, fallback: string): string {
  const raw = String(value || '');
  // Strip control chars defensively; Ably rejects names with embedded newlines.
  const sanitized = raw.trim().replace(/[\u0000-\u001F\u007F]/g, '');
  return sanitized || fallback;
}

/** Org channel prefix. */
export function orgChannelPrefix(orgId: string): string {
  const id = String(orgId || '').trim().toLowerCase();
  if (!UUID_RE.test(id)) {
    throw new Error(`[realtime] refusing to build channel for non-uuid org id: ${JSON.stringify(orgId)}`);
  }
  return `org:${id}`;
}

/** Client-safe wrapper: */
export function safeChannelName(build: () => string): string {
  try {
    return build();
  } catch {
    return '';
  }
}

// ─── Shared (per-org broadcast) channels ────────────────────────────────── Channel suffixes are fixed in-code — the DEFAULT_* constants…

export const getOrdersChannelName = (orgId: string) =>
  `${orgChannelPrefix(orgId)}:${DEFAULT_ORDERS_CHANNEL}`;

export const getRepairsChannelName = (orgId: string) =>
  `${orgChannelPrefix(orgId)}:${DEFAULT_REPAIRS_CHANNEL}`;

export const getAiAssistChannelName = (orgId: string) =>
  `${orgChannelPrefix(orgId)}:${DEFAULT_AI_ASSIST_CHANNEL}`;

export const getAiAssistSessionChannelName = (orgId: string, sessionId: string) =>
  `${getAiAssistChannelName(orgId)}:${normalizeChannelName(sessionId, 'session')}`;

/** Single channel for all station-level row changes (tech logs, packer logs, receiving). */
export const getStationChannelName = (orgId: string) =>
  `${orgChannelPrefix(orgId)}:${DEFAULT_STATION_CHANNEL}`;

export const getStaffChannelName = (orgId: string) =>
  `${orgChannelPrefix(orgId)}:${DEFAULT_STAFF_CHANNEL}`;

export const getFbaChannelName = (orgId: string) =>
  `${orgChannelPrefix(orgId)}:${DEFAULT_FBA_CHANNEL}`;

export const getDashboardChannelName = (orgId: string) =>
  `${orgChannelPrefix(orgId)}:${DEFAULT_DASHBOARD_CHANNEL}`;

export const getOpsPlansChannelName = (orgId: string) =>
  `${orgChannelPrefix(orgId)}:${DEFAULT_OPS_PLANS_CHANNEL}`;

export const getWalkInChannelName = (orgId: string) =>
  `${orgChannelPrefix(orgId)}:${DEFAULT_WALKIN_CHANNEL}`;

/**
 * Agentic-loop master-plan CRDT channel (`org:{uuid}:forge:master-plan`).
 * Carries Yjs sync/update messages for the shared `master-plan.mdx` document —
 * Cursor daemon and web clients merge through it.
 */
export const getMasterPlanChannel = (orgId: string) =>
  `${orgChannelPrefix(orgId)}:${DEFAULT_MASTER_PLAN_CHANNEL}`;

/** Cycle Forge run-history change feed (ingest → dashboard, no polling). */
export const getForgeRunsChannelName = (orgId: string) =>
  `${orgChannelPrefix(orgId)}:${DEFAULT_FORGE_RUNS_CHANNEL}`;

// ─── DB-row change channels ────────────────────────────────────────────────

export const getDbChannelPrefix = (orgId: string) =>
  `${orgChannelPrefix(orgId)}:${DEFAULT_DB_CHANNEL_PREFIX}`;

export const getDbTableChannelName = (orgId: string, schema: string, table: string) =>
  `${getDbChannelPrefix(orgId)}:${schema}:${table}`;

export const getDbRowChannelName = (orgId: string, schema: string, table: string, rowId: string | number) =>
  `${getDbTableChannelName(orgId, schema, table)}:${rowId}`;

// ─── Per-staff channels ─────────────────────────────────────────────────────

/** Per-staff inbox: priority alerts, staff messages, warranty/tech nudges. */
export const getInboxChannelName = (orgId: string, staffId: number | string) =>
  `${orgChannelPrefix(orgId)}:inbox:${normalizeChannelName(String(staffId), 'none')}`;

/** Phone→desktop receiving-station photo bridge (phone publishes scans). */
export const getPhoneBridgeChannelName = (orgId: string, staffId: number | string) =>
  `${orgChannelPrefix(orgId)}:phone:${normalizeChannelName(String(staffId), 'none')}`;

/** Desktop→phone packer wizard hand-off (desktop publishes scan_ready). */
export const getPackerBridgeChannelName = (orgId: string, staffId: number | string) =>
  `${orgChannelPrefix(orgId)}:packer:${normalizeChannelName(String(staffId), 'none')}`;

/**
 * Phone→desktop silent print (staff ID ↔ this computer ↔ USB). Page- and
 * station-agnostic — not a Pack clone. Phone publishes `staff_print_job`;
 * the signed-in desktop host prints and acks.
 */
export const getStaffPrintBridgeChannelName = (orgId: string, staffId: number | string) =>
  `${orgChannelPrefix(orgId)}:print:${normalizeChannelName(String(staffId), 'none')}`;

/** The staff id every non-production print bridge shares unless overridden. */
const DEV_PRINT_BRIDGE_STAFF_ID = 1;

/**
 * Whose print channel a session joins.
 * printer (operator 2026-09-25). Read by the token grant AND both bridge
 */
export function printBridgeStaffId(staffId: number): number {
  if (process.env.NODE_ENV === 'production') return staffId;
  const pinned = Number(process.env.NEXT_PUBLIC_PRINT_BRIDGE_STAFF_ID || DEV_PRINT_BRIDGE_STAFF_ID);
  return Number.isInteger(pinned) && pinned > 0 ? pinned : staffId;
}

const PRINT_STATION_CHANNEL_SEGMENT = 'printstation';

/**
 * Org-wide per-station print channel: ANY staffer reaches one named print
 * station (`readPrintStation().id`) — not per-staff like `:print:{staffId}`.
 * Its own segment, so neither the `:print:` nor the `:station:` grants widen to it.
 */
export const getPrintStationChannelName = (orgId: string, stationId: string) =>
  `${orgChannelPrefix(orgId)}:${PRINT_STATION_CHANNEL_SEGMENT}:${normalizeChannelName(stationId, 'none')}`;

/** The token grant covering every station channel of THIS org only. */
export const getPrintStationChannelPattern = (orgId: string) =>
  `${orgChannelPrefix(orgId)}:${PRINT_STATION_CHANNEL_SEGMENT}:*`;

/**
 * Per-staff desktop↔phone lookup echo bridge. Was the raw `station:{staffId}`,
 * renamed to `staffstation:` so the org's `:station:*` broadcast grant can never
 * widen to this per-staff bridge.
 */
export const getStaffStationBridgeChannelName = (orgId: string, staffId: number | string) =>
  `${orgChannelPrefix(orgId)}:staffstation:${normalizeChannelName(String(staffId), 'none')}`;

/** Desk↔tablet counter-session bridge, keyed by the KIOSK DEVICE — the one channel family in this file that is not per-staff. */
export const getKioskBridgeChannelName = (orgId: string, deviceId: number | string) =>
  `${orgChannelPrefix(orgId)}:kiosk:${normalizeChannelName(String(deviceId), 'none')}`;
