/**
 * SIMPLE-FIRST chat tools (docs/product/SIMPLE-FIRST.md) — the org tells the
 * chat what it needs and the chat unlocks it:
 *
 *   list_capabilities          GREEN  what the org can switch on, and its state
 *   enable_capability          YELLOW confirm-before-write: propose → "yes" →
 *                                     the capability's lanes appear in the sidebar
 *   import_products_from_ebay  YELLOW the eBay listings → catalog import; without
 *                                     an eBay connection it answers with the
 *                                     connect step instead
 *
 * The model passes only what the operator named ("purchase orders"); the
 * capability, its prerequisites and the connect link resolve server-side.
 * Every answer is a capability card (the envelope brand); the model reads a
 * one-paragraph summary.
 */

import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { askOnlyRefusal } from '@/lib/assistant/access-mode';
import { brandReportEnvelope } from '@/lib/assistant/tool-artifact';
import type { ArtifactCapability } from '@/lib/assistant/ui-artifacts';
import { APP_SIDEBAR_NAV } from '@/lib/sidebar-navigation';
import {
  UNLOCKABLE_CAPABILITIES,
  getCapability,
  resolveCapability,
  type CapabilityDef,
} from '@/lib/capabilities/catalog';
import {
  announceCapabilityChange,
  loadCapabilityViews,
  recordCapabilityEvent,
  transitionCapability,
  type CapabilityView,
} from '@/lib/capabilities/store';
import { ENABLE_CAPABILITY_KIND } from '@/lib/capabilities/apply';
import { importEbayListingsToCatalog, type EbayImportResult } from '@/lib/capabilities/ebay-import';
import {
  buildConfirmableWriteTool,
  realConfirmableDeps,
  type ConfirmableWriteDeps,
  type ConfirmableWriteSpec,
  type ProposeOutcome,
} from './confirmable-write';
import type { AssistantToolCtx, AssistantToolDef } from './types';

export const LIST_CAPABILITIES_TOOL = 'list_capabilities';
export const ENABLE_CAPABILITY_TOOL = 'enable_capability';
export const IMPORT_EBAY_PRODUCTS_TOOL = 'import_products_from_ebay';

const NAV_LABEL: Readonly<Record<string, string>> = Object.fromEntries(APP_SIDEBAR_NAV.map((item) => [item.id, item.label]));

const STATE_WORD: Record<CapabilityView['state'], string> = {
  active: 'on',
  setting_up: 'being set up',
  suggested: 'suggested, not on yet',
  locked: 'not on yet',
};

/** The eBay OAuth start for this org — same-origin for the card, https for the chat pill. */
async function ebayConnectLinks(orgId: OrgId, query: ConfirmableWriteDeps['query']): Promise<{ href: string; connectUrl?: string }> {
  const slug = String((await query(orgId, `SELECT slug FROM organizations WHERE id = $1`, [orgId])).rows[0]?.slug ?? 'ebay-main');
  const href = `/api/ebay/connect?accountName=${encodeURIComponent(slug)}`;
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  return base.startsWith('https://') ? { href, connectUrl: `${base}${href}` } : { href };
}

async function cardItem(
  view: CapabilityView,
  orgId: OrgId,
  query: ConfirmableWriteDeps['query'],
): Promise<ArtifactCapability['items'][number]> {
  const { def } = view;
  const navLabels = def.navItemIds.map((id) => NAV_LABEL[id]).filter((l): l is string => Boolean(l));
  const stillNeeded: ArtifactCapability['items'][number]['stillNeeded'] = [];
  for (const p of view.prerequisites) {
    if (p.met) continue;
    if (p.provider === 'ebay') stillNeeded.push({ label: p.label, ...(await ebayConnectLinks(orgId, query)) });
    else stillNeeded.push({ label: p.label, href: '/settings/integrations' });
  }
  return {
    id: def.id,
    label: def.label,
    blurb: def.blurb,
    state: view.state,
    unlocks: def.chatAbility ? [...navLabels, def.chatAbility] : navLabels,
    stillNeeded,
    ...(view.state === 'active' ? { href: def.landingPath } : {}),
  };
}

function connectSentence(item: ArtifactCapability['items'][number]): string {
  const step = item.stillNeeded.find((s) => s.connectUrl);
  if (!step?.connectUrl) return '';
  return ` Status needs_connection: call request_connection with {"app":"ebay","appLabel":"eBay","connectUrl":"${step.connectUrl}","reason":"so I can import your eBay listings"} — pass the URL exactly, never type it in your reply.`;
}

async function viewOf(orgId: OrgId, def: CapabilityDef): Promise<CapabilityView> {
  const views = await loadCapabilityViews(orgId);
  const view = views.find((v) => v.def.id === def.id);
  if (!view) throw new Error(`capability ${def.id} missing from the catalog views`);
  return view;
}

// ─── list_capabilities (GREEN) ───────────────────────────────────────────────

const listInput = z.object({
  capability: z
    .string()
    .trim()
    .max(120)
    .optional()
    .describe('Optional: one capability as the user named it ("purchase orders", "eBay") to show just that one.'),
});

export const listCapabilitiesTool: AssistantToolDef<typeof listInput, unknown> = {
  name: LIST_CAPABILITIES_TOOL,
  description:
    'What this workspace can switch on (capabilities: outbound orders, purchase orders & receiving, eBay product import, customer intake counter, inventory, …), which are on, and what each still needs. Use for "what can you do", "what can I turn on", "is X set up". Shows a capability card itself — no render_artifact. Turning one on is enable_capability.',
  permission: 'assistant.chat',
  inputSchema: listInput,
  run: async (input, ctx) => {
    const orgId = ctx.organizationId as OrgId;
    const views = await loadCapabilityViews(orgId);
    const one = input.capability ? resolveCapability(input.capability) : null;
    const shown = one ? views.filter((v) => v.def.id === one.id) : views;
    const items = await Promise.all(shown.map((v) => cardItem(v, orgId, realConfirmableDeps.query)));
    const on = views.filter((v) => v.state === 'active').map((v) => v.def.label);
    const off = views.filter((v) => v.state !== 'active').map((v) => `${v.def.label} (${STATE_WORD[v.state]})`);
    const artifact: ArtifactCapability = {
      kind: 'capability',
      title: one ? one.label : 'What you can turn on',
      mode: 'list',
      items,
    };
    return brandReportEnvelope(
      {
        artifact,
        summary: `${one ? `${one.label} is ${STATE_WORD[shown[0]!.state]}.` : `On: ${on.join(', ') || 'only the chat'}. Not on: ${off.join(', ') || 'nothing'}.`} To turn one on, call enable_capability with the capability the user named.`,
        answer: one ? `${one.label} is ${STATE_WORD[shown[0]!.state]}.` : `${on.length} of ${views.length} capabilities are on.`,
      },
      LIST_CAPABILITIES_TOOL,
    );
  },
};

// ─── enable_capability (YELLOW, confirm) ─────────────────────────────────────

const enableFields = z.object({
  capability: z
    .string()
    .trim()
    .max(120)
    .optional()
    .describe('The capability as the user named it: "purchase orders", "outbound orders", "eBay", "customer intake counter", … (resolved for you).'),
});

type EnablePayload = { capabilityId: string; staffId: number | null };

const LINK_EVENT_SQL = `UPDATE org_capability_events SET agent_mutation_id = $3
 WHERE organization_id = $1 AND id = (
   SELECT id FROM org_capability_events
    WHERE organization_id = $1 AND capability_id = $2 AND source = 'chat'
      AND agent_mutation_id IS NULL AND event IN ('activated', 'setup_started')
    ORDER BY id DESC LIMIT 1)`;

const enableSpec: ConfirmableWriteSpec<typeof enableFields, EnablePayload> = {
  name: ENABLE_CAPABILITY_TOOL,
  kind: ENABLE_CAPABILITY_KIND,
  permission: 'admin.manage_features',
  description:
    'Turn on a capability for this workspace when the user says what they need: "I need to record purchase orders", "set up outbound orders", "I need a customer intake counter", "turn on eBay import". Its pages then appear in the sidebar. Pass the capability as the user named it. Two steps: action "propose" shows what they get and returns needs_confirmation — ASK the user to confirm and stop. Next message: "confirm" (yes) or "cancel" (no).',
  fields: enableFields,
  pendingPhrase: (p) => `turn on ${getCapability(p.capabilityId)?.label ?? p.capabilityId}`,
  propose: async (ctx, input, deps): Promise<ProposeOutcome<EnablePayload>> => {
    const orgId = ctx.organizationId as OrgId;
    const def = input.capability ? resolveCapability(input.capability) : null;
    if (!def) {
      return {
        ok: false,
        error: `Couldn't match "${input.capability ?? ''}" to a capability. Available: ${UNLOCKABLE_CAPABILITIES.map((c) => c.label).join(', ')}. Ask the user which one they mean. Nothing was changed.`,
      };
    }
    const view = await viewOf(orgId, def);
    const item = await cardItem(view, orgId, deps.query);
    if (view.state === 'active') {
      return {
        ok: true,
        answer: brandReportEnvelope(
          {
            artifact: { kind: 'capability', title: def.label, mode: 'list', items: [item] },
            summary: `${def.label} is already on — its pages are in the sidebar. Nothing to change.`,
            answer: `${def.label} is already on.`,
          },
          ENABLE_CAPABILITY_TOOL,
        ),
      };
    }
    // The ledger remembers the ask even if the operator says no.
    if (view.state === 'locked') {
      await withTenantTransaction(orgId, (client) =>
        transitionCapability(client, { orgId, capabilityId: def.id, toState: 'suggested', staffId: ctx.staffId, source: 'chat' }),
      );
      item.state = 'suggested';
    }
    const waits = item.stillNeeded.map((s) => s.label);
    return {
      ok: true,
      payload: { capabilityId: def.id, staffId: ctx.staffId },
      preview: (mutationId) =>
        brandReportEnvelope(
          {
            artifact: { kind: 'capability', title: `Turn on ${def.label}?`, mode: 'proposal', items: [item] },
            summary: `Ready to turn on ${def.label} (change #${mutationId}): ${item.unlocks.join(', ')}${waits.length ? `; after that it still needs: ${waits.join(', ')}` : ''}. NOT on yet. Reply with exactly this question and stop: "Turn on ${def.label}? Reply yes to confirm." — call this tool with action "confirm" only after the user replies yes ("cancel" if they decline).`,
            answer: `Turn on ${def.label}? Reply yes to confirm.`,
          },
          ENABLE_CAPABILITY_TOOL,
        ),
    };
  },
  settled: async (ctx, payload, mutationId, _targetRef, deps) => {
    const orgId = ctx.organizationId as OrgId;
    const def = getCapability(payload.capabilityId);
    if (!def) return { ok: false, error: `Capability ${payload.capabilityId} is no longer in the catalog.` };
    await deps.query(orgId, LINK_EVENT_SQL, [orgId, def.id, mutationId]);
    const view = await viewOf(orgId, def);
    await announceCapabilityChange(orgId, def.id, view.state);
    const item = await cardItem(view, orgId, deps.query);
    const lanes = def.navItemIds.map((id) => NAV_LABEL[id]).filter(Boolean).join(', ');
    const done =
      view.state === 'active'
        ? `${def.label} is on (change #${mutationId}; "undo that" turns it off). ${lanes} ${def.navItemIds.length === 1 ? 'is' : 'are'} now in the sidebar.`
        : `${def.label} is set up (change #${mutationId}) and still needs: ${item.stillNeeded.map((s) => s.label).join(', ')}. It turns on once that is done.`;
    return brandReportEnvelope(
      {
        artifact: { kind: 'capability', title: view.state === 'active' ? `${def.label} is on` : `${def.label} · setting up`, mode: 'result', items: [item] },
        summary: `${done}${connectSentence(item)}`,
        answer: view.state === 'active' ? `Done — ${def.label} is on. ${lanes} ${def.navItemIds.length === 1 ? 'is' : 'are'} in your sidebar now.` : done,
      },
      ENABLE_CAPABILITY_TOOL,
    );
  },
};

export const ENABLE_CAPABILITY_SPEC = enableSpec;

export function buildEnableCapabilityTool(
  sessionId: string | null,
  turnStartedAt: Date,
  deps?: ConfirmableWriteDeps,
): AssistantToolDef<z.ZodTypeAny, unknown> {
  return buildConfirmableWriteTool(enableSpec, sessionId, turnStartedAt, deps);
}

// ─── import_products_from_ebay (YELLOW) ──────────────────────────────────────

const importInput = z.object({});

export interface ImportEbayToolDeps {
  runImport: (orgId: OrgId) => Promise<EbayImportResult>;
}

export function buildImportEbayProductsTool(
  deps: ImportEbayToolDeps = { runImport: importEbayListingsToCatalog },
): AssistantToolDef<typeof importInput, unknown> {
  return {
    name: IMPORT_EBAY_PRODUCTS_TOOL,
    description:
      'Import the workspace\'s eBay products: "import all my products from eBay", "connect eBay and import my products", "pull my eBay listings". With an eBay account connected it copies every active listing into Products (linked to its eBay item) and turns on eBay product import; without one it returns the connect step (status needs_connection) — then call request_connection exactly as its summary says. No arguments. Shows a capability card itself.',
    permission: 'integrations.ebay',
    inputSchema: importInput,
    run: async (_input, ctx: AssistantToolCtx) => {
      if (ctx.accessMode === 'ask') return { ok: false, error: askOnlyRefusal(IMPORT_EBAY_PRODUCTS_TOOL) };
      const orgId = ctx.organizationId as OrgId;
      const def = getCapability('ebay_import')!;
      const before = await viewOf(orgId, def);
      const ebayConnected = before.prerequisites.every((p) => p.met);

      if (!ebayConnected) {
        const item = await cardItem(before, orgId, realConfirmableDeps.query);
        return brandReportEnvelope(
          {
            artifact: { kind: 'capability', title: 'Import products from eBay', mode: 'list', items: [item] },
            summary: `No eBay account is connected yet, so nothing was imported. Still needed: Connect your eBay account.${connectSentence(item)} After it connects, ask again and the listings import.`,
            answer: 'Connect your eBay account first — then ask again and I will import your listings.',
          },
          IMPORT_EBAY_PRODUCTS_TOOL,
        );
      }

      const result = await deps.runImport(orgId);
      await withTenantTransaction(orgId, async (client) => {
        await transitionCapability(client, {
          orgId,
          capabilityId: def.id,
          toState: 'active',
          staffId: ctx.staffId,
          source: 'chat',
          config: { ebayAccounts: result.accounts },
        });
        await recordCapabilityEvent(client, {
          orgId,
          capabilityId: def.id,
          event: 'imported',
          fromState: 'active',
          toState: 'active',
          staffId: ctx.staffId,
          source: 'chat',
          detail: { listings: result.listings, created: result.created, linked: result.linked, errors: result.errors.slice(0, 5) },
        });
      });
      await announceCapabilityChange(orgId, def.id, 'active');
      const after = await viewOf(orgId, def);
      const item = await cardItem(after, orgId, realConfirmableDeps.query);
      const failed = result.errors.length ? ` ${result.errors.length} account(s) failed: ${result.errors.join('; ').slice(0, 300)}.` : '';
      return brandReportEnvelope(
        {
          artifact: {
            kind: 'capability',
            title: 'eBay products imported',
            mode: 'result',
            items: [item],
            note: `${result.listings} active listings · ${result.created} new products · ${result.linked} linked to eBay`,
          },
          summary: `Imported ${result.listings} active eBay listings from ${result.accounts.join(', ')}: ${result.created} new products, ${result.linked} linked to their eBay item. Products is in the sidebar.${failed}`,
          answer: `Imported ${result.listings} eBay listings — ${result.created} new products are in Products.${failed}`,
        },
        IMPORT_EBAY_PRODUCTS_TOOL,
      );
    },
  };
}
