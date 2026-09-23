#!/usr/bin/env node
/**
 * Extract CONN-* TicketStatus MDX from staff-connections-planning.html.
 *
 *   node scripts/extract-connections-mdx.mjs
 *   node scripts/extract-connections-mdx.mjs --write   # append to master-plan.mdx if missing
 *   node scripts/extract-connections-mdx.mjs --check   # exit 1 if master-plan missing any CONN id
 *
 * Ticket IDs: CONN-{data-check-id} 1:1 with HTML checkboxes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const HTML_PATH = path.join(
  REPO,
  'docs/master-connections-and-refactor/staff-connections-planning.html',
);
const MDX_PATH = path.join(REPO, 'master-plan.mdx');
const MARKER = '# Connections — Now → Change';

const TAB_HREF = {
  start: '/docs/master-connections-and-refactor/staff/INDEX.md',
  big: '/docs/master-connections-and-refactor/staff/01-big-picture.md',
  loc: '/docs/master-connections-and-refactor/staff/02-inventory-and-locations.md',
  tix: '/docs/master-connections-and-refactor/staff/03-testing-and-support-tickets.md',
  jny: '/docs/master-connections-and-refactor/staff/04-item-journey.md',
  zoho: '/docs/master-connections-and-refactor/staff/05-external-inventory-zoho.md',
  pk: '/docs/master-connections-and-refactor/staff/06-local-pickup.md',
  pg: '/docs/master-connections-and-refactor/staff/07-pages-and-design.md',
  rm: '/docs/master-connections-and-refactor/staff/08-roadmap-and-phases.md',
  tech: '/docs/master-connections-and-refactor/master-index-plan.md',
};

const SECTION = {
  start: 'Start',
  big: 'Big picture',
  loc: 'Locations',
  tix: 'Tickets',
  jny: 'Journey',
  zoho: 'Zoho / external inventory',
  pk: 'Pickup',
  pg: 'Pages',
  rm: 'Roadmap',
  tech: 'Technical',
};

function stripTags(s) {
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @returns {Array<{ id: string, prefix: string, label: string, now: string, change: string, href: string, section: string, ticketId: string }>}
 */
export function extractConnectionsFromHtml(html) {
  const idMatches = [...html.matchAll(/data-check-id="([^"]+)"/g)];
  if (idMatches.length === 0) throw new Error('no data-check-id in HTML');

  const items = [];
  for (let i = 0; i < idMatches.length; i++) {
    const m = idMatches[i];
    const cid = m[1];
    const pos = m.index;
    const prev = i > 0 ? idMatches[i - 1].index : 0;
    const chunk = html.slice(prev, pos + 240);

    const staffPairs = [
      ...chunk.matchAll(
        /view-staff[\s\S]*?plan-text now">([\s\S]*?)<\/p>[\s\S]*?plan-text go">([\s\S]*?)<\/p>/g,
      ),
    ];
    const techPairs = [
      ...chunk.matchAll(
        /view-tech[\s\S]*?plan-text now">([\s\S]*?)<\/p>[\s\S]*?plan-text go">([\s\S]*?)<\/p>/g,
      ),
    ];
    const pairs = staffPairs.length ? staffPairs : techPairs;
    let now = '';
    let change = '';
    if (pairs.length) {
      const last = pairs[pairs.length - 1];
      now = stripTags(last[1]);
      change = stripTags(last[2]);
    } else {
      const tail = chunk.slice(-1600);
      const nows = [...tail.matchAll(/plan-text now">([\s\S]*?)<\/p>/g)];
      const gos = [...tail.matchAll(/plan-text go">([\s\S]*?)<\/p>/g)];
      if (nows.length) now = stripTags(nows[nows.length - 1][1]);
      if (gos.length) change = stripTags(gos[gos.length - 1][1]);
    }

    const ariaRe = new RegExp(
      `data-check-id="${cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*aria-label="([^"]*)"`,
    );
    const aria = html.match(ariaRe);
    let label = aria?.[1] || cid;
    label = label.replace(/^Mark\s+/i, '').replace(/\s+done$/i, '');

    const prefix = cid.split('-')[0];
    items.push({
      id: cid,
      prefix,
      label,
      now,
      change,
      href: TAB_HREF[prefix] || '/docs/master-connections-and-refactor/README.md',
      section: SECTION[prefix] || prefix,
      ticketId: `CONN-${cid}`,
    });
  }
  return items;
}

export function renderConnectionsMdx(items) {
  const sections = new Map();
  for (const it of items) {
    if (!sections.has(it.section)) sections.set(it.section, []);
    sections.get(it.section).push(it);
  }

  const lines = [
    '',
    '---',
    '',
    MARKER,
    '',
    '**Promoted from** `docs/master-connections-and-refactor/staff-connections-planning.html` (checkboxes → tickets).',
    '**Narrative:** [staff plans](/docs/master-connections-and-refactor/staff/INDEX.md) · [technical index](/docs/master-connections-and-refactor/master-index-plan.md).',
    'HTML is a **deprecated mirror** — live SoT is this document on `/forge` Plans Live.',
    '',
    'Statuses: `pending` | `in-progress` | `deployed`. Human review on the dogfood tunnel.',
    '',
  ];

  for (const [sec, its] of sections) {
    lines.push(`## ${sec}`, '');
    for (const it of its) {
      lines.push(`### ${it.label}`, '');
      lines.push(`- **Now:** ${it.now || '_(see staff plan)_'}`);
      lines.push(`- **Change:** ${it.change || '_(see staff plan)_'}`, '');
      lines.push(
        `<TicketStatus status="pending" ticketId="${it.ticketId}" href="${it.href}" />`,
        '',
      );
    }
  }
  return lines.join('\n');
}

function main() {
  const args = new Set(process.argv.slice(2));
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const items = extractConnectionsFromHtml(html);
  const fragment = renderConnectionsMdx(items);

  if (args.has('--check')) {
    const mdx = fs.readFileSync(MDX_PATH, 'utf8');
    const missing = items.filter((it) => !mdx.includes(`ticketId="${it.ticketId}"`));
    if (missing.length) {
      console.error(
        `master-plan.mdx missing ${missing.length} CONN tickets:`,
        missing
          .slice(0, 8)
          .map((m) => m.ticketId)
          .join(', '),
      );
      process.exit(1);
    }
    if (!mdx.includes(MARKER)) {
      console.error('master-plan.mdx missing Connections section marker');
      process.exit(1);
    }
    console.log(`ok: ${items.length} CONN tickets present in master-plan.mdx`);
    process.exit(0);
  }

  if (args.has('--write')) {
    let mdx = fs.readFileSync(MDX_PATH, 'utf8');
    if (mdx.includes(MARKER)) {
      // Replace existing connections section through EOF if it's the last major block,
      // else replace from marker to next top-level "# " that isn't under connections.
      const start = mdx.indexOf(MARKER);
      // Find previous --- separator if we authored with --- before marker
      let cut = mdx.lastIndexOf('\n---\n', start);
      if (cut < 0 || start - cut > 40) cut = start;
      // Keep everything before connections; append fresh fragment
      // If marker exists mid-file, drop from cut to end only if no unique later content needed.
      // Safer: remove from cut to EOF if all CONN tickets are only in that section.
      const before = mdx.slice(0, cut).replace(/\s+$/, '');
      mdx = `${before}\n${fragment}`;
      // Ensure trailing newline
      if (!mdx.endsWith('\n')) mdx += '\n';
      fs.writeFileSync(MDX_PATH, mdx);
      console.log(`updated Connections section in master-plan.mdx (${items.length} tickets)`);
    } else {
      const next = mdx.replace(/\s+$/, '') + '\n' + fragment + '\n';
      fs.writeFileSync(MDX_PATH, next);
      console.log(`appended Connections section to master-plan.mdx (${items.length} tickets)`);
    }
    process.exit(0);
  }

  // default: print fragment
  process.stdout.write(fragment);
  if (!fragment.endsWith('\n')) process.stdout.write('\n');
  console.error(`# ${items.length} tickets`);
}

// only run CLI when executed directly
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
