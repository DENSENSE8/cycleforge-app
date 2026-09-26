/** Neon Control Plane client for ephemeral VERIFY branches (ALP-4.2). */

const NEON_API_BASE = 'https://console.neon.tech/api/v2';

/** Every verify branch is named `verify/<runUid>` so sweeps can find them. */
export const VERIFY_BRANCH_PREFIX = 'verify/';

/** Default TTL for failed-run branches before the sweeper deletes them. */
const VERIFY_BRANCH_TTL_MINUTES = 12 * 60;

export interface NeonBranchDeps {
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  env: Record<string, string | undefined>;
  now: () => number;
}

const defaultNeonBranchDeps: NeonBranchDeps = {
  fetchFn: (url, init) => fetch(url, init),
  env: process.env,
  now: () => Date.now(),
};

function requireConfig(deps: NeonBranchDeps): { apiKey: string; projectId: string } {
  const apiKey = deps.env.NEON_API_KEY?.trim();
  const projectId = deps.env.NEON_PROJECT_ID?.trim();
  if (!apiKey) throw new Error('NEON_API_KEY is not set — cannot manage verify branches');
  if (!projectId) throw new Error('NEON_PROJECT_ID is not set — cannot manage verify branches');
  return { apiKey, projectId };
}

async function neonRequest<T>(
  deps: NeonBranchDeps,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const { apiKey } = requireConfig(deps);
  const res = await deps.fetchFn(`${NEON_API_BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Neon API ${method} ${path} failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Normalize a Neon host to its endpoint IDENTITY so pooler/direct variants of the SAME production endpoint compare equal. */
export function neonEndpointIdentity(host: string): string {
  const lower = host.toLowerCase().replace(/^ep-([^.]*?)-pooler\./, 'ep-$1.');
  // Endpoint id is the first label (`ep-...`); keep it plus the rest for region.
  return lower;
}

/**
 * ALP-4.3 guard — the whole point of the sandbox. Throws when a candidate
 * VERIFY connection string points at the production endpoint (any host alias
 * of it), or when there is nothing to compare against (a vacuous guard).
 */
export function assertNotProductionUrl(candidateUrl: string, deps: NeonBranchDeps = defaultNeonBranchDeps): void {
  const prod = deps.env.DATABASE_URL?.trim();
  if (!candidateUrl?.trim()) throw new Error('VERIFY guard: empty candidate connection string');
  if (!prod) {
    throw new Error('VERIFY guard: DATABASE_URL unset — refusing to verify without a production URL to compare against');
  }
  let candidateHost: string;
  let prodHost: string;
  try {
    candidateHost = neonEndpointIdentity(new URL(candidateUrl).host);
    prodHost = neonEndpointIdentity(new URL(prod).host);
  } catch {
    throw new Error('VERIFY guard: unparseable connection string');
  }
  if (candidateHost === prodHost) {
    throw new Error(
      `VERIFY guard: branch connection endpoint "${candidateHost}" is the production endpoint (or an alias of it) — refusing to run agent VERIFY against production`,
    );
  }
}

interface VerifyBranch {
  branchId: string;
  name: string;
  connectionUri: string;
  createdAt: string;
}

interface NeonCreateBranchResponse {
  branch: { id: string; name: string; created_at?: string };
  connection_uris?: Array<{ connection_uri: string }>;
}

/** Create a CoW verify branch (+ read-write endpoint) and mint its URL. */
export async function createVerifyBranch(
  runUid: string,
  deps: NeonBranchDeps = defaultNeonBranchDeps,
): Promise<VerifyBranch> {
  const { projectId } = requireConfig(deps);
  const name = `${VERIFY_BRANCH_PREFIX}${runUid}`.slice(0, 120);
  const data = await neonRequest<NeonCreateBranchResponse>(deps, 'POST', `/projects/${projectId}/branches`, {
    branch: { name },
    endpoints: [{ type: 'read_write' }],
  });
  // From here the branch EXISTS on Neon — any failure below must delete it,
  // or a create that can't produce a usable/safe URL leaks a live prod clone.
  try {
    const connectionUri = data.connection_uris?.[0]?.connection_uri ?? '';
    if (!connectionUri) {
      throw new Error(`Neon created branch ${data.branch.id} but returned no connection_uri`);
    }
    assertNotProductionUrl(connectionUri, deps);
    return {
      branchId: data.branch.id,
      name: data.branch.name,
      connectionUri,
      createdAt: data.branch.created_at ?? new Date(deps.now()).toISOString(),
    };
  } catch (err) {
    await deleteBranch(data.branch.id, deps).catch((delErr) =>
      console.error(`[neon] failed to clean up orphaned branch ${data.branch.id}:`, delErr),
    );
    throw err;
  }
}

export async function deleteBranch(branchId: string, deps: NeonBranchDeps = defaultNeonBranchDeps): Promise<void> {
  const { projectId } = requireConfig(deps);
  await neonRequest(deps, 'DELETE', `/projects/${projectId}/branches/${encodeURIComponent(branchId)}`);
}

interface NeonListBranchesResponse {
  branches: Array<{ id: string; name: string; created_at: string }>;
}

/** Every branch created by this module (the `verify/` namespace). */
export async function listVerifyBranches(
  deps: NeonBranchDeps = defaultNeonBranchDeps,
): Promise<Array<{ id: string; name: string; createdAt: string }>> {
  const { projectId } = requireConfig(deps);
  const data = await neonRequest<NeonListBranchesResponse>(deps, 'GET', `/projects/${projectId}/branches`);
  return data.branches
    .filter((b) => b.name.startsWith(VERIFY_BRANCH_PREFIX))
    .map((b) => ({ id: b.id, name: b.name, createdAt: b.created_at }));
}

/**
 * TTL sweep (ALP-6.2): failed-run branches are kept for retry, but never
 * forever. Deletes verify branches older than `ttlMinutes`; returns the ids
 * it deleted. Safe to run any time — only touches the `verify/` namespace.
 */
export async function sweepExpiredVerifyBranches(
  ttlMinutes: number = VERIFY_BRANCH_TTL_MINUTES,
  deps: NeonBranchDeps = defaultNeonBranchDeps,
): Promise<string[]> {
  // A non-numeric TTL (e.g. `sweep 12h` from a cron line) must NOT silently
  // become a no-op sweep that leaks branches forever — fall back to the default.
  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) ttlMinutes = VERIFY_BRANCH_TTL_MINUTES;
  const branches = await listVerifyBranches(deps);
  const cutoff = deps.now() - ttlMinutes * 60_000;
  const deleted: string[] = [];
  for (const b of branches) {
    const created = Date.parse(b.createdAt);
    if (Number.isFinite(created) && created < cutoff) {
      await deleteBranch(b.id, deps);
      deleted.push(b.id);
    }
  }
  return deleted;
}
