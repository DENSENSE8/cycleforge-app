/**
 * Teaching regions for the Home ("/") modes that are not yet wired.
 *
 * `today` (My Day) and `forge` (the live plan console) compose real surfaces in
 * `HomeWorkspace`; these three — Tasks, Collab, Brief — are the Phase B/D/E
 * seams. Each declares its job + the exact sources it will compose (plan §6 /
 * §21–31) so the shell documents the plan where staff will read it.
 *
 * Presentation only — no hooks, no data. Each panel owns its own scroll
 * (`h-full overflow-y-auto`) because the mode region is a height-bounded host.
 * When a mode gets a real list it graduates to a `SidebarShell` picker and the
 * search band moves to the sidebar (sidebar-mode law #2), not here.
 */

import Link from 'next/link';
import { Panel } from '@/design-system/primitives';


interface ModeLink {
  label: string;
  href: string;
}

function HomeModePlaceholder({
  eyebrow,
  title,
  blurb,
  wires,
  links,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  wires?: string[];
  links?: ModeLink[];
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Panel radius="2xl" padding="lg">
          <p className="text-role-micro uppercase tracking-widest text-text-soft">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-semibold text-text-strong">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">{blurb}</p>

          {wires && wires.length > 0 ? (
            <div className="mt-5">
              <p className="text-role-micro uppercase tracking-widest text-text-soft">
                Wires up next
              </p>
              <ul className="mt-2 space-y-1.5">
                {wires.map((w) => (
                  <li key={w} className="flex items-start gap-2 text-sm text-text-muted">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {links && links.length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {links.map((l) => (
                <Link
                  key={l.href + l.label}
                  href={l.href}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-soft bg-surface px-3 py-1.5 text-sm font-semibold text-text-strong transition-colors hover:bg-surface-sunken"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

/** Collab — entity-anchored ops threads. Plan §6.3 (Phase D). */
export function HomeCollabPanel() {
  return (
    <HomeModePlaceholder
      eyebrow="Home · Collab"
      title="Threads live on the entity"
      blurb="Ops conversations are now anchored to the record itself — open any order, receiving line, unit, warranty claim, or support ticket and use its Conversation panel to comment (internal note or public reply), always entity-anchored, never a freeform channel. This mode will graduate to a cross-entity inbox of the threads you follow."
      wires={[
        'Shipped: entity_threads / thread_messages + ThreadPanel on Order / Receiving line / Unit / Warranty / Support',
        'Next (this mode): a personal inbox of followed threads (@mention ride staff_messages + org:{id}:inbox:{staffId})',
        'Task/phase anchor (ops_plan_task) is a new discriminator value — needs a schema decision before it joins the 7 surface types',
        'Thread refresh rides the existing ops_plans:changes channel',
      ]}
      links={[
        { label: 'Back to Tasks', href: '/?mode=tasks' },
        { label: 'Open the dashboard', href: '/dashboard' },
      ]}
    />
  );
}

/** Brief — AI shift coach. Plan §6.5 (Phase E). */
export function HomeBriefPanel() {
  return (
    <HomeModePlaceholder
      eyebrow="Home · Brief"
      title="End-of-shift brief"
      blurb="An AI-written record of what the shift completed, what is stuck, and how to work better with in-app capabilities — deep-linking to stations and Settings → Integrations in capability language, never vendor product sentences."
      wires={[
        'GET/POST /api/home/brief — button-triggered, read-only v1 (plan §26)',
        'Facts assembled deterministically from Neon; LLM narrates only the “how to improve”',
        'Provider via resolveOrgAiConfig; metered via recordAiUsage(context=shift_brief)',
        'Stored in ops_shift_briefs (BIGINT id from birth so it can be search-indexed later)',
      ]}
    />
  );
}
