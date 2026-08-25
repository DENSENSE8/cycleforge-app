/**
 * commit_to_git — hand a validated tool change to code review.
 *
 * ─── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────
 * It does not branch, commit, or push. AGENTS.md is unambiguous: "Never create
 * a git branch. Always work on main… The operator manages commits." An agent
 * that pushes reverses a standing decision, so this takes the route the repo
 * already uses for machine-authored changes: file a labelled GitHub Issue,
 * which .github/workflows/claude-fix-issue.yml picks up to produce a commit and
 * a PR a human merges. Same destination, and the human stays where the operator
 * put them.
 *
 * The requested branch_name is recorded on the request and included in the
 * issue body as a HINT for the downstream action. It is never executed here.
 *
 * ─── WHY THIS IS SINGLE-TENANT, ON PURPOSE ─────────────────────────────────
 * DENSENSE8/cycleforge-app belongs to ONE tenant — the org that owns this
 * codebase. Mirroring another tenant's request into it would publish their
 * prompt and generated code into a repo they do not own, and would create an
 * issue no other tenant's flow can ever close. src/app/api/user-issues/route.ts
 * already learned this and gates its mirror on FORGE_ORG_ID; the same gate is
 * applied here rather than rediscovered later. Every other tenant gets the full
 * request record in their own Neon rows and a clear refusal from this step.
 *
 * ─── ALSO WORTH KNOWING ────────────────────────────────────────────────────
 * A merged PR does not deploy. vercel.json sets git.deploymentEnabled:false;
 * production ships only from the ci.yml deploy job, and only when the diff
 * touches scripts/vercel-should-build.mjs's allowlist. So this returns
 * 'handed_off', never 'deployed' — a success message keyed to the push would be
 * reporting something that did not happen.
 */

import type { OrgId } from '@/lib/tenancy/constants';

const GITHUB_API = 'https://api.github.com';
const GITHUB_REPO = 'DENSENSE8/cycleforge-app';

/** The one org whose requests may be mirrored into the shared repo. */
export function forgeOrgId(env: NodeJS.ProcessEnv = process.env): string {
  return (env.FORGE_ORG_ID ?? '00000000-0000-0000-0000-000000000001').toLowerCase();
}

export interface HandoffInput {
  buildRequestId: number;
  branchName: string;
  targetScope: string;
  prompt: string;
  files: ReadonlyArray<{ path: string; contents: string }>;
}

export type HandoffResult =
  | { ok: true; externalRef: string; mode: 'issue' }
  | { ok: false; error: string };

export interface HandoffDeps {
  fetchImpl: typeof fetch;
  token: string | undefined;
  orgIdForRepo: string;
}

const defaultDeps = (): HandoffDeps => ({
  fetchImpl: fetch,
  token: process.env.GITHUB_TOKEN,
  orgIdForRepo: forgeOrgId(),
});

export async function handOffToReview(
  orgId: OrgId,
  input: HandoffInput,
  deps: Partial<HandoffDeps> = {},
): Promise<HandoffResult> {
  const { fetchImpl, token, orgIdForRepo } = { ...defaultDeps(), ...deps };

  if (orgId.toLowerCase() !== orgIdForRepo) {
    return {
      ok: false,
      error:
        `This organization's requests are not mirrored to ${GITHUB_REPO}. ` +
        `The shared repository belongs to a single tenant, so the request has been ` +
        `recorded here for a local operator to action instead.`,
    };
  }
  if (!token) {
    return { ok: false, error: 'GITHUB_TOKEN is not configured; cannot file the review request.' };
  }

  const body = [
    `**Automated tool-forge request #${input.buildRequestId}**`,
    '',
    `- Target scope: \`${input.targetScope}\``,
    `- Suggested branch: \`${input.branchName}\``,
    '',
    '### Request',
    '',
    input.prompt,
    '',
    '### Proposed files',
    '',
    ...input.files.map((f) => `- \`${f.path}\` (${f.contents.length} bytes)`),
    '',
    '---',
    'Generated code passed sandbox validation. A human reviews and merges; nothing',
    'here has been committed or pushed.',
  ].join('\n');

  let res: Response;
  try {
    res = await fetchImpl(`${GITHUB_API}/repos/${GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({
        title: `[tool-forge] ${input.targetScope}: request #${input.buildRequestId}`,
        body,
        labels: ['tool-forge', 'user-reported'],
      }),
    });
  } catch (err) {
    return { ok: false, error: `GitHub request failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 300);
    return { ok: false, error: `GitHub returned ${res.status}: ${text}` };
  }

  const json = (await res.json().catch(() => ({}))) as { html_url?: string; number?: number };
  return {
    ok: true,
    mode: 'issue',
    externalRef: json.html_url ?? `${GITHUB_REPO}#${json.number ?? '?'}`,
  };
}
