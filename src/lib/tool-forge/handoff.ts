/** commit_to_git — hand a validated tool change to code review. */

import type { OrgId } from '@/lib/tenancy/constants';

const GITHUB_API = 'https://api.github.com';
const GITHUB_REPO = 'DENSENSE8/cycleforge-app';

/** The one org whose requests may be mirrored into the shared repo. */
function forgeOrgId(env: NodeJS.ProcessEnv = process.env): string {
  return (env.FORGE_ORG_ID ?? '00000000-0000-0000-0000-000000000001').toLowerCase();
}

interface HandoffInput {
  buildRequestId: number;
  branchName: string;
  targetScope: string;
  prompt: string;
  files: ReadonlyArray<{ path: string; contents: string }>;
}

type HandoffResult =
  | { ok: true; externalRef: string; mode: 'issue' }
  | { ok: false; error: string };

interface HandoffDeps {
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
