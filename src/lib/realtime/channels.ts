/**
 * Ably channel names — ORG-NAMESPACED.
 *
 * Every channel is `org:{orgId}:{suffix}`. The org boundary is enforced two ways:
 *   1. The token endpoint (src/app/api/realtime/token/route.ts) grants a client
 *      capability ONLY for its own `org:{ctx.organizationId}:*` — so even if a
 *      client builds another org's channel name, Ably denies the subscribe.
 *   2. `orgChannelPrefix()` THROWS on a missing/malformed org id, so a publisher
 *      can never accidentally build an un-namespaced (cross-tenant) channel.
 *
 * Server publishers pass `ctx.organizationId` (or `transitionalDogfoodOrgId()` for
 * the transitional jobs). Client subscribers pass `user.organizationId` from the
 * auth context and must wrap construction in `safeChannelName()` (which returns
 * '' instead of throwing) so a not-yet-hydrated user gates `enabled=false`
 * rather than crashing the render.
 */

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

/**
 * Org channel prefix. THROWS on a missing/malformed org id — a realtime channel
 * must never be built without a tenant, or two tenants would share it. Callers
 * are server-side publishers (orgId from ctx.organizationId) and the token
 * endpoint. Client code that may not have a hydrated org yet must use
 * `safeChannelName()` to gate on a valid name instead of catching this throw.
 */
export function orgChannelPrefix(orgId: string): string {
  const id = String(orgId || '').trim().toLowerCase();
  if (!UUID_RE.test(id)) {
    throw new Error(`[realtime] refusing to build channel for non-uuid org id: ${JSON.stringify(orgId)}`);
  }
  return `org:${id}`;
}

/**
 * Client-safe wrapper: returns the built name, or '' if the org id is missing /
 * malformed (so the caller can pass `enabled = !!name` to useAblyChannel rather
 * than crash). Example:
 *   const ch = safeChannelName(() => getOrdersChannelName(orgId));
 *   useAblyChannel(ch, 'order.changed', handler, !!ch && enabled);
 */
export function safeChannelName(build: () => string): string {
  try {
    return build();
  } catch {
    return '';
  }
}

// ─── Shared (per-org broadcast) channels ──────────────────────────────────
// Channel suffixes are fixed in-code — the DEFAULT_* constants above are the
// single source of truth. Tenant isolation is the `org:{orgId}` prefix
// (enforced by the token endpoint + orgChannelPrefix()); there is no
// per-deployment env override of channel names.

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
 * Cursor daemon, web clients, and the forge plan-agent all merge through it.
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
//
// Each is locked to a single staffId AND namespaced by org. The token endpoint
// grants only the caller's own staffId channels (no cross-staff wildcard), so a
// staffer can neither read nor forge another staffer's inbox/bridge events.

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
 * Whose print channel a session joins. Production: the signed-in staffer —
 * a phone only ever prints on computers signed in as the same staff ID.
 * Every other build (localhost, dev tunnel, Tailscale IP — all `next dev`):
 * ONE shared channel, staff 1 by default or `NEXT_PUBLIC_PRINT_BRIDGE_STAFF_ID`,
 * so a phone and a desk signed in as different staffers can test the same
 * printer (operator 2026-09-25). Read by the token grant AND both bridge
 * hooks, so the grant and the channel can never disagree.
 */
export function printBridgeStaffId(staffId: number): number {
  if (process.env.NODE_ENV === 'production') return staffId;
  const pinned = Number(process.env.NEXT_PUBLIC_PRINT_BRIDGE_STAFF_ID || DEV_PRINT_BRIDGE_STAFF_ID);
  return Number.isInteger(pinned) && pinned > 0 ? pinned : staffId;
}

/**
 * Per-staff desktop↔phone lookup echo bridge. Was the raw `station:{staffId}`,
 * renamed to `staffstation:` so the org's `:station:*` broadcast grant can never
 * widen to this per-staff bridge.
 */
export const getStaffStationBridgeChannelName = (orgId: string, staffId: number | string) =>
  `${orgChannelPrefix(orgId)}:staffstation:${normalizeChannelName(String(staffId), 'none')}`;

/**
 * Desk↔tablet counter-session bridge, keyed by the KIOSK DEVICE — the one
 * channel family in this file that is not per-staff.
 *
 * It cannot be per-staff: the two peers are a staff desktop and a device
 * principal that has no staffId at all, and the lease holder changes during a
 * shift while the tablet stays put. The device is the stable end of the pair,
 * so it names the channel; the desk is granted this channel only for devices it
 * has actually claimed (see the token routes), never a `kiosk:*` wildcard.
 *
 * Both peers subscribe AND publish here, like the per-staff bridges above.
 */
export const getKioskBridgeChannelName = (orgId: string, deviceId: number | string) =>
  `${orgChannelPrefix(orgId)}:kiosk:${normalizeChannelName(String(deviceId), 'none')}`;

/** Phone→desktop scan-history feed (read-only; never writes receiving_*). */
export const getScanLogChannelName = (orgId: string, staffId: number | string) =>
  `${orgChannelPrefix(orgId)}:scanlog:${normalizeChannelName(String(staffId), 'none')}`;
