#!/usr/bin/env node
/**
 * design-mcp — the CycleForge design system, served to agents over MCP (stdio).
 *
 *   "what already exists for this job?"  → ds_contract
 *   "what values may I use here?"        → ds_tokens
 *   "why is this component bad?"         → ds_critique
 *
 * ## Why the contract is DERIVED, not written
 *
 * Garisek's equivalent reads a hand-curated `PINNED_COMPONENTS` map with a
 * `useWhen` / `doNot` sentence per entry. CycleForge has no such file, and its
 * primitives carry no docblocks to derive those sentences from — `Button.tsx`
 * opens straight into imports. Writing 56 `doNot` rules from the outside would
 * be inventing law and serving it with authority, which is the one failure a
 * design-system oracle must never commit.
 *
 * So `ds_contract` reports what the repo can actually prove: every primitive
 * that exists, where it lives, and its real variant surface read out of the
 * source. Curated prose is layered on top from `design-system/pinned.json` when
 * that file exists — it is optional, starts empty, and grows one justified
 * entry at a time.
 *
 * ## The two primitive homes
 *
 * `src/design-system/primitives` (36 `.tsx`) and `src/components/ui` (16) both
 * hold primitives. That duplication is a real open question in this repo and
 * NOT something this server resolves — it reports both, labelled, so an agent
 * sees the choice instead of picking whichever it happened to grep first.
 *
 * ## Why no ds_adjudicate
 *
 * Garisek's version shares a rule module with a PreToolUse hook, so its verdict
 * is the same verdict that blocks a write. CycleForge has no such module, and a
 * tool that returned "allowed" while nothing enforced anything would be worse
 * than absent: it would manufacture confidence. ESLint is this repo's gate; run
 * it. When a shared adjudicator exists here, this is where it plugs in.
 *
 * stdout carries JSON-RPC only; every diagnostic goes to stderr.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
// Compared against, never REPO itself: a checkout reached through a symlinked
// parent would otherwise fail its own containment check.
const REPO_REAL = realpathSync(REPO)

/** Where primitives legitimately live. Order is reporting order, not preference. */
const PRIMITIVE_HOMES = [
  { dir: 'src/design-system/primitives', label: 'design-system primitive', alias: '@/design-system/primitives' },
  { dir: 'src/design-system/components', label: 'design-system component', alias: '@/design-system/components' },
  { dir: 'src/components/ui', label: 'ui primitive (shadcn lineage)', alias: '@/components/ui' },
]

const TOKEN_CSS = ['src/shell/tokens.css', 'src/styles/globals.css', 'src/app/globals.css']
const OVERRIDES = 'src/design-system/pinned.json'

// ── contract ─────────────────────────────────────────────────────────────────

function readOverrides() {
  const p = path.join(REPO, OVERRIDES)
  if (!existsSync(p)) return {}
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch (e) {
    // Loud, not silent: a malformed overrides file must not degrade into "no
    // curated rules exist", which an agent would read as permission.
    throw new Error(`${OVERRIDES} is present but unparseable (${e.message}) — refusing to serve a partial contract.`)
  }
}

/**
 * Option names declared at depth 0 of an object body.
 *
 * Walks tracking brace/bracket depth and quote state. A regex cannot do this:
 * inside a variants map, `'hover:bg-x'` in a class string is indistinguishable
 * from a `hover:` key by pattern alone, and matching both reports interaction
 * prefixes as selectable variants — an agent then writes variant="hover",
 * which does not exist.
 */
function keysAtTopLevel(body) {
  const src = stripComments(body)
  const names = []
  let depth = 0
  let token = ''
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch
      let j = i + 1
      let lit = ''
      while (j < src.length && !(src[j] === q && src[j - 1] !== '\\')) { lit += src[j]; j++ }
      i = j
      token = depth === 0 ? lit : ''
      continue
    }
    if (ch === '{' || ch === '[' || ch === '(') { depth++; token = ''; continue }
    if (ch === '}' || ch === ']' || ch === ')') { depth--; token = ''; continue }
    if (depth !== 0) continue
    if (ch === ':') {
      const nm = token.trim()
      if (/^[\w-]+$/.test(nm)) names.push(nm)
      token = ''
      continue
    }
    if (ch === ',') { token = ''; continue }
    token += ch
  }
  return names
}

/** Strip comments while preserving string literals — a `//` line eats the key after it otherwise. */
function stripComments(src) {
  let out = ''
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch
      out += ch; i++
      while (i < src.length && !(src[i] === q && src[i - 1] !== '\\')) { out += src[i]; i++ }
      out += src[i] ?? ''; i++
      continue
    }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (ch === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    out += ch; i++
  }
  return out
}

/** The block following `anchor`, brace-matched. Null when the anchor is absent. */
function blockAfter(source, anchor, from = 0) {
  const at = source.indexOf(anchor, from)
  if (at < 0) return null
  const open = source.indexOf('{', at)
  if (open < 0) return null
  let depth = 1
  let i = open + 1
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') depth--
    i++
  }
  return source.slice(open + 1, i - 1)
}

const AFFORDANCES = [
  { key: 'focus-visible styling', re: /focus-visible:|focusRing|focus_ring/ },
  { key: 'disabled styling', re: /disabled:/ },
  { key: 'hover styling', re: /hover:/ },
  { key: 'active/pressed styling', re: /active:/ },
  { key: 'motion role', re: /motionRole|useMotion|framer/ },
  { key: 'aria wiring', re: /aria-[a-z]+/ },
]

/**
 * Every primitive the repo actually has, with the variant surface its source
 * declares. Cached per process — the file set does not change mid-session, and
 * re-walking on every call would make `ds_contract` the slowest tool here.
 */
let INVENTORY = null
function inventory() {
  if (INVENTORY) return INVENTORY
  const out = []
  for (const home of PRIMITIVE_HOMES) {
    const abs = path.join(REPO, home.dir)
    let entries = []
    try {
      entries = readdirSync(abs)
    } catch {
      continue
    }
    for (const file of entries) {
      if (!/\.tsx$/.test(file)) continue
      const rel = path.join(home.dir, file)
      let source = ''
      try {
        source = readFileSync(path.join(REPO, file === '' ? '' : rel), 'utf8')
      } catch {
        continue
      }
      const id = file.replace(/\.tsx$/, '')
      // Variants may live inline or in a sibling `*-variants.ts` (Button does).
      let variantSource = source
      const sibling = path.join(REPO, home.dir, `${id.toLowerCase()}-variants.ts`)
      if (existsSync(sibling)) {
        try {
          variantSource += '\n' + readFileSync(sibling, 'utf8')
        } catch { /* keep what we have */ }
      }
      // Anchor on the DECLARATION, not on any occurrence. `_VARIANTS` also
      // appears in Button.tsx's own import line, and anchoring there sent the
      // brace-matcher into the import's `{ … }` — which reported the flagship
      // primitive as having zero variants while a sibling file declared nine.
      const decl = variantSource.match(/(?:const|let|var)\s+\w*VARIANTS\w*\s*(?::[^=]*)?=\s*\{/)
      const vBlock = blockAfter(variantSource, 'variants:') ??
        (decl ? blockAfter(variantSource, '{', decl.index + decl[0].length - 1) : null)

      const axes = {}
      if (vBlock) {
        // Two shapes live in this repo, and handling only one under-reports:
        //   cva  → `variants: { variant: { primary: … }, size: { sm: … } }`
        //   flat → `BUTTON_VARIANTS = { primary: '…', ghost: '…' }`
        // A key is an AXIS only if its value opens a block. If none do, the
        // whole map is itself one axis of options.
        for (const axis of keysAtTopLevel(vBlock)) {
          const m = new RegExp(`(?:^|[,{\\s])${axis}\\s*:\\s*\\{`).exec(vBlock)
          if (!m) continue
          const body = blockAfter(vBlock, '{', m.index + m[0].length - 1)
          const opts = body ? keysAtTopLevel(body) : []
          if (opts.length) axes[axis] = opts
        }
        if (Object.keys(axes).length === 0) {
          const flat = keysAtTopLevel(vBlock)
          if (flat.length) axes.variant = flat
        }
      }
      out.push({
        id,
        home: home.label,
        file: rel,
        import: `${home.alias}/${id}`,
        variant_axes: axes,
        declares: AFFORDANCES.filter((a) => a.re.test(source)).map((a) => a.key),
        lines: source.split('\n').length,
      })
    }
  }
  INVENTORY = out
  return out
}

// ── tokens ───────────────────────────────────────────────────────────────────

function loadTokens() {
  const tokens = []
  for (const rel of TOKEN_CSS) {
    let css = ''
    try {
      css = readFileSync(path.join(REPO, rel), 'utf8')
    } catch {
      continue
    }
    for (const line of css.split('\n')) {
      const d = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i)
      if (d) tokens.push({ name: d[1], value: d[2].trim(), source: rel })
    }
  }
  // Later files win, matching cascade order, but report the duplicate rather
  // than hiding it: two definitions of one token is a real defect here.
  const seen = new Map()
  for (const t of tokens) {
    if (seen.has(t.name)) seen.get(t.name).duplicates.push(t.source)
    else seen.set(t.name, { ...t, duplicates: [] })
  }
  return [...seen.values()]
}

function axisOf(name) {
  if (/^--(c|color)-/.test(name)) return 'color'
  if (/^--(r|radius)/.test(name)) return 'radius'
  if (/^--(sp|space|spacing)-/.test(name)) return 'spacing'
  if (/^--(sz|text|font|fs)-/.test(name)) return 'typography'
  if (/^--z-/.test(name)) return 'z-index'
  if (/^--(shadow|elevation)-/.test(name)) return 'elevation'
  if (/^--(border|outline)/.test(name)) return 'border'
  return 'other'
}

// ── ranking ──────────────────────────────────────────────────────────────────

const STOP = new Set(['a', 'an', 'the', 'for', 'of', 'to', 'in', 'on', 'and', 'or', 'with', 'that', 'this', 'is', 'my'])
const terms = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t))

function score(entry, q, override) {
  const id = entry.id.toLowerCase()
  const useWhen = terms(override?.useWhen ?? '').join(' ')
  let s = 0
  for (const t of q) {
    if (id === t) s += 12
    else if (id.includes(t)) s += 6
    if (useWhen.includes(t)) s += 5
    if (entry.file.toLowerCase().includes(t)) s += 2
  }
  return s
}

// ── path safety ──────────────────────────────────────────────────────────────

/**
 * `realpathSync` for a path that may not exist yet: resolve the longest
 * existing prefix and re-attach the rest. A link one directory up is the same
 * escape as a link on the leaf, so the walk cannot stop at the first miss.
 */
function realOf(abs) {
  let head = abs
  const tail = []
  for (;;) {
    try {
      return path.join(realpathSync(head), ...tail)
    } catch (e) {
      if (e?.code !== 'ENOENT') throw e
      const parent = path.dirname(head)
      if (parent === head) return abs
      tail.unshift(path.basename(head))
      head = parent
    }
  }
}

/**
 * Resolve a caller-supplied path INSIDE the repo, or throw.
 *
 * The path arrives from a model, so it is untrusted input: `../../.ssh/id_rsa`
 * is a perfectly plausible hallucination. Two things must hold before the read
 * is safe, and `path.resolve` only delivers the first:
 *
 *   1. traversal is collapsed — `path.resolve` does this, which is why a `..`
 *      denylist over the raw string is both weaker and unnecessary;
 *   2. no symlink leaves the repo — `path.resolve` does NOT do this. It is
 *      string arithmetic and never touches the filesystem, so a link sitting
 *      inside the tree (`tools/x/link -> /etc/passwd`) satisfies (1) and is
 *      read anyway. That was a real hole here, not a hypothetical one.
 *
 * So containment is decided on the REAL path of both ends.
 */
function resolveInRepo(input) {
  const raw = String(input ?? '').trim()
  if (!raw) throw new Error('file_path is required')
  const real = realOf(path.resolve(REPO, raw))
  const rel = path.relative(REPO_REAL, real)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`refusing to read outside the repo: ${raw}`)
  }
  return { abs: real, rel }
}

const FORK_SIGNALS = [
  { pin: 'Button', re: /<button[\s>]/, what: 'a raw <button>' },
  { pin: 'Input', re: /<input[\s>]/, what: 'a raw <input>' },
  { pin: 'Checkbox', re: /type=["']checkbox["']/, what: 'a raw checkbox input' },
  { pin: 'Dialog', re: /role=["']dialog["']/, what: 'a hand-rolled dialog role' },
  { pin: 'Tooltip', re: /role=["']tooltip["']/, what: 'a hand-rolled tooltip role' },
]

const LITERAL_PATTERNS = [
  { kind: 'arbitrary type size', re: /text-\[\d+(\.\d+)?(px|rem|em)\]/g },
  { kind: 'arbitrary z-index', re: /z-\[\d+\]/g },
  { kind: 'hardcoded hex', re: /#[0-9a-fA-F]{3,8}\b/g },
  { kind: 'inline style object', re: /style=\{\{/g },
]

const lineOf = (text, needle) => (needle && text.includes(needle) ? text.slice(0, text.indexOf(needle)).split('\n').length : null)

// ── tools ────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'ds_contract',
    description:
      'What this design system ALREADY has for a UI job — call before building anything. Describe the job ' +
      'in plain words ("row of actions", "status chip", "confirm a destructive action") and this returns ' +
      'the matching primitives that exist, where they live, their real variant options read from source, ' +
      'and the interaction states they handle. If something here covers the job, building beside it is a fork.',
    inputSchema: {
      type: 'object',
      properties: {
        intent: { type: 'string', description: 'The UI job in plain words. A component name works too.' },
        limit: { type: 'integer', default: 5, minimum: 1, maximum: 20 },
      },
      required: ['intent'],
    },
  },
  {
    name: 'ds_tokens',
    description:
      'The values this design system allows on a visual axis — colour, radius, spacing, typography, ' +
      'z-index, border, elevation. Ask before writing any literal (a hex, a px radius, an arbitrary text ' +
      'size): if a token covers it, the literal is drift.',
    inputSchema: {
      type: 'object',
      properties: {
        axis: {
          type: 'string',
          enum: ['color', 'radius', 'spacing', 'typography', 'z-index', 'elevation', 'border', 'other', 'all'],
          default: 'all',
        },
        filter: { type: 'string', description: 'Substring match on the token name, e.g. "surface" or "sunken".' },
      },
    },
  },
  {
    name: 'ds_critique',
    description:
      'Ask "why is this component bad?" for one file and get the blunt answer: hand-rolled primitives that ' +
      'fork something the system already has, arbitrary literals used where tokens exist, whether it uses ' +
      'the design system at all, and its size. Reads the file from disk, so it sees the file as it is now.',
    inputSchema: {
      type: 'object',
      properties: { file_path: { type: 'string', description: 'Repo-relative path, e.g. "src/shell/AssistantFeed.tsx".' } },
      required: ['file_path'],
    },
  },
]

const server = new Server({ name: 'cycleforge-design-mcp', version: '0.1.0' }, { capabilities: { tools: {} } })
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

const json = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] })

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params
  try {
    if (name === 'ds_contract') {
      const all = inventory()
      if (all.length === 0) {
        throw new Error('No primitives found in any known home — refusing to answer with an empty catalog.')
      }
      const overrides = readOverrides()
      const q = terms(args.intent)
      const limit = Math.min(Math.max(args.limit ?? 5, 1), 20)
      const hits = all
        .map((e) => ({ e, s: score(e, q, overrides[e.id]) }))
        .filter((h) => h.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map(({ e }) => ({ ...e, ...(overrides[e.id] ?? {}) }))

      return json({
        matches: hits,
        catalog_size: all.length,
        curated_entries: Object.keys(overrides).length,
        guidance:
          hits.length === 0
            ? 'Nothing matched. That is NOT permission to build a new primitive — try different wording ' +
              '(the index is by component name and path, not by job description yet), then look through ' +
              'src/design-system/primitives directly.'
            : 'variant_axes and declares are read from the source, so they cannot disagree with the code. ' +
              'useWhen/doNot appear only where a human has curated them in src/design-system/pinned.json — ' +
              'their absence means nobody has written the law yet, NOT that anything is permitted.',
      })
    }

    if (name === 'ds_tokens') {
      const all = loadTokens()
      const axis = args.axis ?? 'all'
      const filter = args.filter ? String(args.filter).toLowerCase() : null
      const rows = all
        .filter((t) => (axis === 'all' ? true : axisOf(t.name) === axis))
        .filter((t) => (filter ? t.name.toLowerCase().includes(filter) : true))
        .map((t) => ({ token: t.name, value: t.value, axis: axisOf(t.name), source: t.source, ...(t.duplicates.length ? { alsoDefinedIn: t.duplicates } : {}) }))
      return json({
        count: rows.length,
        sources: TOKEN_CSS,
        tokens: rows,
        note: 'Use var(--token) rather than the literal. A token survives a theme change; a literal does not.',
      })
    }

    if (name === 'ds_critique') {
      const { abs, rel } = resolveInRepo(args.file_path)
      let source
      try {
        source = readFileSync(abs, 'utf8')
      } catch (e) {
        throw new Error(e?.code === 'ENOENT' ? `no such file: ${rel}` : `cannot read ${rel}: ${e?.message ?? e}`)
      }

      const all = inventory()
      const byId = new Map(all.map((e) => [e.id, e]))
      const used = all.filter((e) => source.includes(e.import) || new RegExp(`from ['"][^'"]*/${e.id}['"]`).test(source)).map((e) => e.id)
      const isPrimitiveHome = PRIMITIVE_HOMES.some((h) => rel.startsWith(h.dir))

      const problems = []
      if (!isPrimitiveHome) {
        for (const s of FORK_SIGNALS) {
          if (!s.re.test(source) || used.includes(s.pin)) continue
          const e = byId.get(s.pin)
          problems.push({
            severity: 'forks-the-system',
            line: lineOf(source, (source.match(s.re) ?? [])[0]),
            what: `${s.what} where the system has ${s.pin}`,
            fix: e ? `Import ${s.pin} from ${e.import}` : `Use the existing ${s.pin}.`,
            confidence: 'heuristic',
          })
        }
      }

      const literals = []
      for (const { kind, re } of LITERAL_PATTERNS) {
        const hits = source.match(new RegExp(re.source, 'g')) ?? []
        if (hits.length) literals.push({ kind, count: hits.length, examples: [...new Set(hits)].slice(0, 4) })
      }
      const literalTotal = literals.reduce((n, l) => n + l.count, 0)
      if (literalTotal > 0) {
        problems.push({
          severity: 'drifts-from-tokens',
          what: `${literalTotal} arbitrary literal${literalTotal === 1 ? '' : 's'} where tokens exist`,
          detail: literals,
          fix: 'Call ds_tokens for the axis and use var(--token).',
        })
      }
      if (!isPrimitiveHome && used.length === 0 && /<[A-Z]/.test(source)) {
        problems.push({
          severity: 'no-system-usage',
          what: 'Renders components but imports none from the design system',
          fix: 'Call ds_contract with the job this file does.',
        })
      }
      const lines = source.split('\n').length
      if (lines > 300) {
        problems.push({ severity: 'size', what: `${lines} lines — past the point reviewers read`, fix: 'Split the leaf presentational parts out.' })
      }

      const RANK = { 'forks-the-system': 0, 'drifts-from-tokens': 1, 'no-system-usage': 2, size: 3 }
      problems.sort((a, b) => RANK[a.severity] - RANK[b.severity])

      return json({
        file: rel,
        summary:
          problems.length === 0
            ? 'No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.'
            : `${problems.length} problem${problems.length === 1 ? '' : 's'}, worst first: ${problems[0].what}`,
        problems,
        design_system_used: used,
        metrics: { lines, arbitrary_literals: literalTotal },
        notes: [
          'Everything here is HEURISTIC — text matches, not AST proof, and this repo has no shared adjudicator ' +
            'for this server to borrow a verdict from. Treat each as "go look at this line".',
          'ESLint is the gate in this repo. A clean result here does not mean a clean lint.',
          ...(isPrimitiveHome ? ['Fork detection is off: this path is where primitives are DEFINED.'] : []),
        ],
      })
    }

    throw new Error(`unknown tool "${name}"`)
  } catch (err) {
    return { content: [{ type: 'text', text: `design-mcp error: ${err?.message ?? err}` }], isError: true }
  }
})

await server.connect(new StdioServerTransport())
process.stderr.write('cycleforge-design-mcp: ready\n')
