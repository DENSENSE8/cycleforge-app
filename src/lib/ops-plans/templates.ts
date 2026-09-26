import type { OpsPlanStation } from './constants';

interface PlanTemplatePhase {
  station: OpsPlanStation;
  title: string;
  /**
   * Human-facing checklist lines (config / training / verification).
   * Optional `clientEventId` for idempotent re-seed (must use `conn-adopt:` prefix
   * for connections adoption — never `master-plan:`).
   */
  tasks: Array<string | { title: string; clientEventId?: string }>;
}

interface PlanTemplate {
  templateKey: string;
  title: string;
  description: string;
  phases: PlanTemplatePhase[];
}

/** Normalize a template task entry to title + optional client_event_id. */
export function normalizeTemplateTask(
  task: string | { title: string; clientEventId?: string },
): { title: string; clientEventId: string | null } {
  if (typeof task === 'string') return { title: task, clientEventId: null };
  return {
    title: task.title,
    clientEventId: task.clientEventId?.trim() || null,
  };
}

/** Product CONN-* tickets live in master-plan.mdx (dogfood / forge org only). */
export const CONNECTIONS_GAP_ADOPTION_KEY = 'connections_gap_adoption' as const;

export const PLAN_TEMPLATES: Record<string, PlanTemplate> = {
  inventory_accuracy_cycle_count: {
    templateKey: 'inventory_accuracy_cycle_count',
    title: 'Inventory accuracy recovery',
    description: 'Bin audit, variance reconciliation, and sign-off cycle for inventory accuracy.',
    phases: [
      {
        station: 'RECEIVING',
        title: 'Bin audit',
        tasks: ['Count aisle assignments', 'Relabel mis-slotted SKUs'],
      },
      {
        station: 'TECH',
        title: 'Variance reconciliation',
        tasks: ['Re-count flagged SKUs', 'Update bin locations'],
      },
      {
        station: 'ADMIN',
        title: 'Sign-off',
        tasks: ['Review variance report', 'Close cycle'],
      },
    ],
  },

  [CONNECTIONS_GAP_ADOPTION_KEY]: {
    templateKey: CONNECTIONS_GAP_ADOPTION_KEY,
    title: 'Connections gap adoption',
    description:
      'Org checklist to adopt shipped Cycle Forge connections capabilities (config, training, floor verification). ' +
      'Does not change product code — product work is tracked as CONN-* on the dogfood master plan.',
    phases: [
      {
        station: 'ADMIN',
        title: 'Governance & language',
        tasks: [
          {
            title: 'Align team language: Item Journey (unit timeline) vs Drift (stock ledger alerts only)',
            clientEventId: 'conn-adopt:language',
          },
          {
            title: 'Point managers to Operations ▸ Plans (and /forge on dogfood) for live connection tickets',
            clientEventId: 'conn-adopt:live-plans-pointer',
          },
          {
            title: 'Confirm roles/permissions cover receiving, tech, packing, and plans.manage as needed',
            clientEventId: 'conn-adopt:permissions',
          },
          {
            title: 'Review connections staff INDEX + technical index with leads (1-on-1 upgrade path)',
            clientEventId: 'conn-adopt:docs-review',
          },
        ],
      },
      {
        station: 'RECEIVING',
        title: 'Locations & receiving',
        tasks: [
          {
            title: 'Walk bin hierarchy with floor leads (room → bay → bin) against live locations UI',
            clientEventId: 'conn-adopt:loc-hierarchy',
          },
          {
            title: 'Verify putaway / transfers update the same place the journey history shows',
            clientEventId: 'conn-adopt:loc-putaway',
          },
          {
            title: 'Train Unbox + Triage happy path; note any dual-model pickup confusion',
            clientEventId: 'conn-adopt:recv-stations',
          },
          {
            title: 'Confirm local pickup readiness is visible on the surface staff actually use',
            clientEventId: 'conn-adopt:pickup-surface',
          },
        ],
      },
      {
        station: 'TECH',
        title: 'Tickets & item journey',
        tasks: [
          {
            title: 'Verify FAIL / support tickets link to units (ticket_links) when testing rejects',
            clientEventId: 'conn-adopt:tix-fail',
          },
          {
            title: 'Open a unit journey / history and confirm tickets + photos appear in one story',
            clientEventId: 'conn-adopt:jny-ui',
          },
          {
            title: 'Confirm serial attach / move still lands on the journey timeline',
            clientEventId: 'conn-adopt:jny-serial',
          },
        ],
      },
      {
        station: 'PACK',
        title: 'Pack & ship touchpoints',
        tasks: [
          {
            title: 'Confirm pack complete writes through the shared unit path (no mystery status)',
            clientEventId: 'conn-adopt:pack-unit-path',
          },
          {
            title: 'Spot-check Orders / Shipping deep-links from a packed order still resolve',
            clientEventId: 'conn-adopt:ship-deeplink',
          },
        ],
      },
      {
        station: 'ADMIN',
        title: 'Integrations & external inventory',
        tasks: [
          {
            title: 'Confirm inventory provider is connected via Settings → Integrations (capability facade)',
            clientEventId: 'conn-adopt:zoho-connector',
          },
          {
            title: 'Run or schedule a sync and confirm staff see status without vendor-branded dead ends',
            clientEventId: 'conn-adopt:zoho-sync-ux',
          },
          {
            title: 'Document which facts stay local vs mirror from the external inventory system',
            clientEventId: 'conn-adopt:zoho-schema',
          },
        ],
      },
      {
        station: 'ADMIN',
        title: 'Pages & navigation',
        tasks: [
          {
            title: 'Confirm dogfood nav only shows stations + shipping (parked surfaces stand-in if opened)',
            clientEventId: 'conn-adopt:pg-nav',
          },
          {
            title: 'Walk archetype surfaces: Station (unbox/pack) vs Workbench (dashboard) with a new hire',
            clientEventId: 'conn-adopt:pg-archetypes',
          },
        ],
      },
      {
        station: 'ADMIN',
        title: 'Sign-off',
        tasks: [
          {
            title: 'Lead sign-off: adoption tasks done or explicitly deferred with owners',
            clientEventId: 'conn-adopt:signoff',
          },
          {
            title: 'Archive or pause this plan when the warehouse is trained on shipped connections',
            clientEventId: 'conn-adopt:close',
          },
        ],
      },
    ],
  },
};

export function getPlanTemplate(templateKey: string): PlanTemplate | null {
  return PLAN_TEMPLATES[templateKey] ?? null;
}

export function listPlanTemplateKeys(): string[] {
  return Object.keys(PLAN_TEMPLATES);
}
