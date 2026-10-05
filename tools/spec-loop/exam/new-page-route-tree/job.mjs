// Exam job: a new Warehouse phone page is a ROUTE TREE node first.
// Outcome: a new /m page lists the totes and opens one.
// Law: src/lib/nav/route-tree.ts (+ route-tree-law.ts, .omp/rules/route-literals.md) —
// every Warehouse URL, nav name and domain word comes from the tree: the page is a
// live node's `page`, links use WAREHOUSE_PATHS / the builders (containerPath), no
// path literals, a child never wears its parent's name, a tote is never an "LPN".

import { addedCode, addedLines, at, parseDiff, readBase, userText, verdict } from '../_lib.mjs'

export const job = {
  v: 1,
  id: 'new-page-route-tree',
  title: 'Totes list page on the phone (Warehouse)',
  base: '0ff1acb44',
  task:
    'On the phone app, add a page under Warehouse (the menu’s Inventory group) that lists every tote — where it is and how many units it holds — and opens the tote when you tap it.',
  domainFact:
    'The route tree (src/lib/nav/route-tree.ts, owner 2026-10-03) is the one source for every Warehouse URL, nav name and domain word: a new page is a node (it already plans `containers` under Warehouse), its URL is read through WAREHOUSE_PATHS / builders like containerPath(id), never typed; a child is never named like its parent; a tote is a container — "LPN" is Receiving’s word, not the tote’s.',
  trap:
    'Create `src/app/m/(shell)/totes/page.tsx`, push `/m/h/${id}` string literals, add a hand-typed menu href, call totes "LPNs" — and never touch the route tree.',
  lease: ['src/app/m/**', 'src/components/mobile/**', 'src/lib/nav/**', 'src/lib/mobile/**'],
  weight: 1,
}

const TREE = 'src/lib/nav/route-tree.ts'
const MENU = 'src/components/mobile/v2/mobile-v2-destinations.tsx'
/** A Warehouse path typed as a string (route-literals.md), incl. the usual invented ones. */
const PATH_LITERAL = /['"`]\/m\/(?:stock|loc\/|labels|racks|h\/|h['"`?]|totes?\b|containers?\b|lpns?\b|warehouse\b)/
const BANNED_COPY = /\bLPNs?\b|licen[cs]e[- ]plated|handling units?\b/i

/** `src/app/m/(shell)/h/page.tsx` → `/m/h`; `[id]` stays a segment pattern. */
function urlOf(pageFile) {
  return pageFile
    .replace(/^src\/app/, '')
    .replace(/\/page\.(tsx|ts|jsx|js)$/, '')
    .split('/')
    .filter((seg) => seg && !/^\(.*\)$/.test(seg))
    .reduce((acc, seg) => `${acc}/${seg}`, '')
}

/** The tree's node objects as text, keyed by id (static parse of ROUTE_TREE). */
function treeNodes(text) {
  const start = String(text ?? '').indexOf('export const ROUTE_TREE')
  if (start < 0) return []
  const body = text.slice(start)
  const nodes = []
  for (const m of body.matchAll(/\n  \{\n([\s\S]*?)\n  \},?/g)) {
    const t = m[1]
    // First occurrence wins: the structural fields precede `note`.
    const field = (name) => new RegExp(`\\b${name}:\\s*(?:'([^']*)'|null)`).exec(t)?.[1] ?? null
    nodes.push({
      id: field('id'),
      parent: field('parent'),
      kind: field('kind'),
      label: field('label'),
      path: field('path'),
      page: field('page'),
      status: field('status'),
    })
  }
  return nodes.filter((n) => n.id)
}

/** `ctx`: ExamCheckContext (Garisek-OS src/lib/loops/spec/types.ts). */
export async function check(ctx) {
  const reasons = []
  const files = parseDiff(ctx.diff)
  const code = addedCode(ctx.diff)

  // ── Outcome ────────────────────────────────────────────────────────────────
  const pages = files.filter((f) => f.isNew && /^src\/app\/m\/.+\/page\.(tsx|ts)$/.test(f.file)).map((f) => f.file)
  if (pages.length === 0) reasons.push('outcome: no new phone page under src/app/m')
  const newText = files.filter((f) => !f.isDeleted).map((f) => String(ctx.read(f.file) ?? '')).join('\n')
  if (!/\/api\/handling-units\b|listHandlingUnits\s*\(/.test(newText)) {
    reasons.push('outcome: nothing added reads the totes (/api/handling-units)')
  }

  // ── Law: the page is a live Warehouse node ────────────────────────────────
  const nodes = treeNodes(ctx.read(TREE))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const baseNodes = new Map(treeNodes(readBase(ctx, TREE)).map((n) => [n.id, n]))
  const underWarehouse = (n) => {
    for (let cur = n, hops = 0; cur && hops < 20; cur = byId.get(cur.parent), hops++) if (cur.id === 'warehouse') return true
    return false
  }
  for (const page of pages) {
    const node = nodes.find((n) => n.page === page)
    if (!node) {
      reasons.push(`law: ${page} is no ROUTE_TREE node's page (src/lib/nav/route-tree.ts)`)
      continue
    }
    if (node.status !== 'live') reasons.push(`law: node "${node.id}" names ${page} but is not live`)
    if (node.path !== urlOf(page)) reasons.push(`law: node "${node.id}" path ${node.path} is not where ${page} serves (${urlOf(page)})`)
    if (!underWarehouse(node)) reasons.push(`law: node "${node.id}" is not under the Warehouse lane`)
    const parent = byId.get(node.parent)
    if (parent && node.kind !== 'record' && parent.label?.toLowerCase() === node.label?.toLowerCase()) {
      reasons.push(`law: node "${node.id}" wears its parent's name "${parent.label}" (nav-name law)`)
    }
    const was = baseNodes.get(node.id)
    if (!was && byId.has('containers')) {
      reasons.push(`law: invented node "${node.id}" while the tree already plans "containers" for the tote list`)
    }
  }

  // ── Law: URLs come from the tree, never typed ─────────────────────────────
  for (const l of code) {
    if (l.file === TREE) continue
    if (PATH_LITERAL.test(l.text)) reasons.push(`law: Warehouse path literal (use WAREHOUSE_PATHS / builders) — ${at(l)}`)
  }
  if (!code.some((l) => /\bcontainerPath\s*\(/.test(l.text))) {
    reasons.push('law: opening a tote does not go through containerPath(id)')
  }

  // ── Law: the phone menu lists it in the Warehouse group ──────────────────
  const menuAdds = addedLines(ctx.diff, new RegExp(`^${MENU.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
  const addedIds = menuAdds.map((l) => /^\s*id:\s*'([^']+)'/.exec(l.text)?.[1]).filter(Boolean)
  const inventoryLine = /\binventory:\s*\[([^\]]*)\]/.exec(String(ctx.read(MENU) ?? ''))?.[1] ?? ''
  for (const id of addedIds) {
    if (!inventoryLine.includes(`'${id}'`)) reasons.push(`law: menu destination "${id}" is not in the inventory (Warehouse) group`)
  }

  // ── Law: vocabulary ───────────────────────────────────────────────────────
  for (const l of code) {
    if (!/\.(tsx|ts)$/.test(l.file) || l.file === TREE) continue
    const copy = userText(l.text)
    if (BANNED_COPY.test(copy)) reasons.push(`law: banned word for a tote in UI copy — ${at(l)}`)
  }

  return verdict(reasons, `${pages.join(', ')} is the live route-tree node, links via the tree's builders`)
}
