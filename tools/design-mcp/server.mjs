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
 * ## Primitive homes
 *
 * `src/design-system/primitives` is ops chrome (the CTA Button). `src/components/ui`
 * holds two kinds of file: the eleven shadcn/new-york primitives (house tokens)
 * that new composed / 21st.dev work starts from, and house composites (CopyChip,
 * FilterMenu, …). The server labels those separately. Two Buttons is two jobs,
 * not a choice: ops CTA → design-system Button; shadcn-lane chrome → ui/button.
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
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/**
 * The tree this server describes.
 *
 * Defaults to the checkout the script sits in, which is right whenever the
 * tool and the design system are the same tree. They are NOT always: the
 * warehouse-os work happens in a sibling worktree that carries `src/shell`
 * and `src/components/composer` while this checkout carries the tool — and a
 * server aimed at the wrong half answers "no tokens, no composer", which an
 * agent reads as "no law exists" rather than "you asked the wrong tree".
 *
 * `DESIGN_MCP_REPO` aims it. It must exist and it must be a directory; a bad
 * value fails loudly here rather than degrading into an empty catalog.
 */
const REPO = (() => {
  const override = process.env.DESIGN_MCP_REPO
  if (!override) return path.resolve(HERE, '..', '..')
  const abs = path.resolve(override)
  if (!existsSync(abs)) throw new Error(`DESIGN_MCP_REPO=${override} does not exist — refusing to serve an empty catalog.`)
  return abs
})()
// Compared against, never REPO itself: a checkout reached through a symlinked
// parent would otherwise fail its own containment check.
const REPO_REAL = realpathSync(REPO)

/** Filenames in `src/components/ui` that ARE the shadcn/new-york primitives (house tokens). Everything else in that folder is a house composite. */
const SHADCN_UI = /^(button|input|label|checkbox|badge|alert|skeleton|separator|dialog|command|popover|calendar)\.tsx$/

/** Where primitives legitimately live. Order is reporting order, not preference. */
const PRIMITIVE_HOMES = [
  { dir: 'src/design-system/primitives', label: 'design-system primitive', alias: '@/design-system/primitives' },
  { dir: 'src/design-system/components', label: 'design-system component', alias: '@/design-system/components' },
  // New composed work (21st.dev imports, shadcn-lane chrome) starts HERE.
  // Ops CTAs still take design-system/primitives/Button — two Buttons, two jobs.
  {
    dir: 'src/components/ui',
    label: 'shadcn primitive (new-york, house tokens)',
    alias: '@/components/ui',
    match: SHADCN_UI,
  },
  {
    dir: 'src/components/ui',
    label: 'ui composite (house)',
    alias: '@/components/ui',
    match: { test: (file) => /\.tsx$/.test(file) && !SHADCN_UI.test(file) },
  },
  { dir: 'src/components/composer', label: 'composer surface', alias: '@/components/composer' },
  // The ONE table. Added 2026-08-31 after an agent asked this catalog for "data
  // table, spreadsheet, grid" and was answered with a composer, a calendar and
  // an inline-edit field — because `src/components/tables` was not a home — and
  // went on to hand-roll a per-family column model and row component for a
  // surface the shared engine already served. A catalog that cannot name the
  // biggest display in the product is not silent, it is misleading.
  { dir: 'src/components/tables', label: 'table engine (house)', alias: '@/components/tables' },
  // The slot KERNEL, by name. A column on this engine is a slot binding
  // resolved from a field catalog, not a hand-written array, and an agent has
  // to be able to find that out by asking.
  {
    dir: 'src/lib/tables',
    label: 'table engine (slot kernel)',
    alias: '@/lib/tables',
    match: /^(materialize-tracks|slot-layout|table-definition)\.ts$/,
  },
  // The desk FRAME's app-side adapter. `DeskPageChrome` itself is catalogued
  // from `src/design-system/components`, but the thing a page actually mounts is
  // `DeskPageLayout` — it reads SIDEBAR_PAGE_NAV and AuthContext, which is
  // exactly why it cannot live in the design system. Without this home the pin
  // for it in `pinned.json` merges onto nothing and is law no agent can find:
  // the same failure that put `src/components/tables` on this list.
  {
    dir: 'src/components/desk',
    label: 'desk frame (app adapter)',
    alias: '@/components/desk',
    match: /^DeskPageLayout\.tsx$/,
  },
  // The print-faithful 2×1" sticker + pinpoint slot overlay. Added 2026-08-31
  // after inline label edit lived only on Unbox and `ds_contract` answered
  // "printed sticker" with the shadcn field `label`. Nested files in this
  // folder are NOT catalogued — pin the FLAT face files only.
  {
    dir: 'src/components/labels',
    label: 'label face (house)',
    alias: '@/components/labels',
    match:
      /^(LabelFacePreview|LabelFaceSlotOverlay|LabelPlatformTypeMenu|LabelFaceReceivingSlots|LabelFaceProductSlots|WorkspaceLabelPreviewCard|LabelPreviewCard)\.tsx$/,
  },
  { dir: 'src/lib/optimistic', label: 'write primitive', alias: '@/lib/optimistic', match: /^useOptimisticMutation\.ts$/ },
  // Scan-station skin catalog. The picker in Appearance lists STATION_SKIN_NAMES
  // from this file; ds_tokens({ axis: 'station-skin' }) is the introspective SoT
  // so agents stop inventing a 17th Unbox-only fill.
  {
    dir: 'src/design-system/themes',
    label: 'theme catalog (house)',
    alias: '@/design-system/themes',
    match: /^station-skins\.ts$/,
  },
  {
    dir: 'src/design-system/themes',
    label: 'theme catalog (house)',
    alias: '@/design-system/themes',
    match: /^station-depths\.ts$/,
  },
  // Phone item-record cluster (qty · condition · notes) + Pick/Packed marks.
  // Nested under components/item-record, so the walk must name the faces or
  // ds_contract answers a calendar for "mobile to-ship qty".
  {
    dir: 'src/design-system/components/item-record',
    label: 'item-record face (house)',
    alias: '@/design-system/components/item-record',
    match: /^(ItemRecordQtyBadge|ItemRecordThumb|ItemRecordMobileMeta|ItemRecordMobileStage)\.tsx$/,
  },
]

/**
 * One slice per call. `all` / `other` were dump buckets — an agent shown every
 * axis invents from the pile. Name the axis you are about to write.
 *
 * After you change a file in TOKEN_TS: run `node tools/design-mcp/smoke.mjs`
 * and the axis unit test (radius.test.ts, shadows, …). Then code-graph
 * `find_symbol` + `impact_analysis` on the role function (`cornerClass`,
 * `elevationClass`, `focusRing`) so the next session sees real call sites.
 */
const TOKEN_AXES = ['color', 'radius', 'spacing', 'typography', 'z-index', 'elevation', 'border', 'focus', 'station-skin', 'station-depth', 'item-record']

/**
 * The axes whose law is TypeScript (or Node-native `.mjs` twins), not CSS.
 *
 * Radius left CSS custom properties entirely — `globals.css` says corner radius
 * is deliberately NOT there — and colour never lived in the CSS files a grep
 * would see: `themes/registry.ts` generates palettes at runtime. A CSS-only
 * reader is therefore blind, and blind here is worse than absent, because the
 * tool still answers confidently.
 *
 * Read as text from DESIGN_MCP_REPO, never imported: this server boots on
 * plain node without `tsx`, and a worktree override must not silently read
 * the checkout the script sits in.
 */
const TOKEN_TS = {
  radius: 'src/design-system/tokens/radius.ts',
  themes: 'src/design-system/themes/registry.ts',
  stationSkins: 'src/design-system/themes/station-skins.ts',
  stationDepths: 'src/design-system/themes/station-depths.ts',
  spacing: 'src/design-system/tokens/spacing.mjs',
  zIndex: 'src/design-system/tokens/z-index.mjs',
  elevation: 'src/design-system/tokens/shadows.ts',
  focus: 'src/design-system/tokens/focus-ring.ts',
  border: 'src/design-system/tokens/borders.ts',
  typePresets: 'src/design-system/tokens/typography/presets.ts',
  typeSizes: 'src/design-system/tokens/typography/sizes.ts',
  itemRecordFace: 'src/design-system/components/item-record/item-record-face.ts',
  itemRecordMobile: 'src/design-system/tokens/item-record-mobile.ts',
  tailwind: 'tailwind.config.mjs',
}
const OVERRIDES = 'src/design-system/pinned.json'

// ── contract ─────────────────────────────────────────────────────────────────

function readOverrides() {
  const p = path.join(REPO, OVERRIDES)
  if (!existsSync(p)) return {}
  try {
    // `_`-prefixed keys are notes to the humans editing the file, not component
    // ids — they must not inflate curated_entries or shadow a primitive.
    return Object.fromEntries(Object.entries(JSON.parse(readFileSync(p, 'utf8'))).filter(([k]) => !k.startsWith('_')))
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

/**
 * Depth-0 object body following `key:` inside `body`. Quoted kebab keys
 * (`'paper-mill':`) and bare ids (`porcelain:`) both work.
 */
function objectAfterKey(body, key) {
  const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?:^|[\\n,{])\\s*(?:'${escaped}'|${escaped})\\s*:`)
  const m = re.exec(body)
  if (!m) return null
  return blockAfter(body, '{', m.index + m[0].length - 1)
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
      if (file.includes('.test.')) continue
      const indexed = home.match ? home.match.test(file) : /\.tsx$/.test(file)
      if (!indexed) continue
      const rel = path.join(home.dir, file)
      let source = ''
      try {
        source = readFileSync(path.join(REPO, file === '' ? '' : rel), 'utf8')
      } catch {
        continue
      }
      const id = file.replace(/\.tsx?$/, '')
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
      const entry = {
        id,
        home: home.label,
        file: rel,
        import: `${home.alias}/${id}`,
        variant_axes: axes,
        declares: AFFORDANCES.filter((a) => a.re.test(source)).map((a) => a.key),
        lines: source.split('\n').length,
      }
      // Flat `*_VARIANTS = { compact: 'ship-by…', range: 'filter…' }` notes
      // are how ds_contract picks a face (pickVariant / mount). Class maps
      // (Button) also match this shape; recommendVariant drops those as notes.
      if (vBlock && (axes.variant ?? []).length) {
        const notes = variantNotesFromBlock(vBlock, axes.variant)
        if (Object.keys(notes).length) entry.variant_notes = notes
      }
      out.push(entry)
    }
  }
  INVENTORY = out
  return out
}

// ── tokens ───────────────────────────────────────────────────────────────────

/** Quoted members of `const NAME = [ ... ]`. */
function arrayAfter(src, decl) {
  const i = src.indexOf(decl)
  if (i === -1) return []
  const open = src.indexOf('[', i)
  const close = src.indexOf(']', open)
  if (open === -1 || close === -1) return []
  return [...src.slice(open + 1, close).matchAll(/'([^']+)'/g)].map((m) => m[1])
}

function readTs(rel) {
  try {
    return readFileSync(path.join(REPO, rel), 'utf8')
  } catch {
    return ''
  }
}

function quotedMap(src, anchor) {
  const body = blockAfter(src, anchor)
  if (!body) return []
  return [...body.matchAll(/^\s*'?([A-Za-z0-9_.-]+)'?\s*:\s*'([^']*)'/gm)].map((m) => [m[1], m[2]])
}

function unionMembers(src, typeName) {
  const m = src.match(new RegExp(`export type ${typeName}\\s*=\\s*([^;]+)`))
  if (!m) return []
  return [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1])
}

function row(axis, source, name, value, use) {
  return { name, value, axis, source, use, duplicates: [] }
}

/**
 * Curated prose for the named soft-corner constants. Absent = nobody has
 * written that law yet (see README), so the generic sentence says what the
 * constant IS without inventing a rule about where it may be used.
 */
const NAMED_CORNER_USE = {
  COMPOSER_SHELL_CORNER:
    'Named exemption for the composer-shell family only — not a CornerRole. ' +
    'cornerClass() cannot express this: every ladder rung is rounded-none. ' +
    'Inner controls take SEGMENTED_CONTROL_CORNER (16px dock - p-1.5 -> rounded-lg ' +
    'track, then p-0.5 -> rounded-md faces). ' +
    'Never a hand-written rounded-* and never appearance=flush inside the dock. ' +
    'The station Unbox|Ticket caption uses the same constant on a FLAT plate; ' +
    'elevationClass(raised) stays on OmnichannelComposerDock (z-raised over z-base).',
  SEGMENTED_CONTROL_CORNER:
    'Track of a pick-one segmented control inside a SOFT shell ' +
    '(VisibilityToggle appearance=default). Concentric with COMPOSER_SHELL_CORNER: ' +
    '16px - p-1.5 = 10 -> the 8px rung. An ops-chrome segmented control stays ' +
    'square via appearance=flush instead.',
  SEGMENTED_CONTROL_FACE_CORNER:
    'The two faces inside SEGMENTED_CONTROL_CORNER: 8px track - p-0.5 = 6px. ' +
    'Import it; never hand-write rounded-md on a segmented face.',
}

const GENERIC_CORNER_USE = (name) =>
  `Named corner constant (${name}) — an exemption from the flush-square ladder, ` +
  'not a CornerRole. cornerClass() cannot express it: every ladder rung is ' +
  'rounded-none. Import the constant; never re-type its class. No curated law ' +
  'for it yet — that means unwritten, not permitted.'

/**
 * The radius law: the ROLE→class map an agent is meant to call, then the raw
 * scale. Roles come first deliberately — `cornerClass('card')` survives a scale
 * change and `rounded-2xl` does not, and a model shown both picks the first.
 */
function loadRadiusTokens() {
  const rel = TOKEN_TS.radius
  const src = readTs(rel)
  if (!src) return []
  const out = []

  for (const [role, cls] of quotedMap(src, 'const CORNER_CLASS')) {
    out.push(row('radius', rel, `cornerClass('${role}')`, cls,
      `cn(cornerClass('${role}')) — import { cornerClass } from '@/design-system/tokens/radius'`))
  }

  // EVERY named `*_CORNER` export, not just the composer shell. These are the
  // escape hatch from the zero-radius ladder — a soft corner that ships has to
  // be named here or `ds_critique` has nothing to check a call site against,
  // and the primitive carrying it as a literal is invisible drift. Discovered
  // by pattern so a new one surfaces the moment it is exported; prose is
  // curated per constant, and an unknown one still gets a usable sentence
  // rather than being dropped.
  for (const m of src.matchAll(/export const ([A-Z0-9_]*_CORNER) = '([^']+)'/g)) {
    const [, name, cls] = m
    out.push(row('radius', rel, name, cls, NAMED_CORNER_USE[name] ?? GENERIC_CORNER_USE(name)))
  }

  for (const [key, value] of quotedMap(src, 'export const radius =')) {
    out.push(row('radius', rel, `radius.${key}`, value,
      'Typed mirror of the px scale. Prefer a cornerClass role over this — a role survives a scale change.'))
  }

  return out
}

/**
 * The colour law. Values are deliberately absent: every one of these resolves
 * per theme (8) and per staff accent (8 × light/dark), so any single value
 * printed here would be a lie an agent could paste. The NAME is the answer.
 */
function loadThemeTokens() {
  const rel = TOKEN_TS.themes
  const src = readTs(rel)
  if (!src) return []
  const out = []

  const themes = arrayAfter(src, 'export const ACCENT_NAMES')
  const varKeys = arrayAfter(src, 'export const THEME_VAR_KEYS')
  for (const key of varKeys) {
    out.push(row('color', rel, `--ds-color-${key}`, 'per theme', `var(--ds-color-${key})`))
  }

  const literals = new Set([...src.matchAll(/`\$\{indent\}(--[a-z-]+):/g)].map((m) => m[1]))
  for (const name of literals) {
    if (varKeys.some((k) => name === `--ds-color-${k}`)) continue
    out.push(row(
      'color',
      rel,
      name,
      name.startsWith('--ds-color-accent') ? `per staff accent (${themes.length})` : 'per theme',
      `var(${name})`,
    ))
  }

  if (process.env.DESIGN_MCP_PLANT_HEX === '1') {
    out.push(row('color', rel, '--ds-color-__planted', '#1a1a1d', 'SMOKE PLANT — not a real token'))
  }

  return out
}

function loadSpacingTokens() {
  const out = []
  const twRel = TOKEN_TS.tailwind
  const tw = readTs(twRel)
  for (const [, name] of tw.matchAll(/^\s+'((?:inset|stack|row)-[a-z]+)'\s*,/gm)) {
    out.push(row('spacing', twRel, name, 'intent',
      `className="${name}" — padding/gap intent, not a raw p-* / gap-*. Density-aware.`))
  }

  const rel = TOKEN_TS.spacing
  const src = readTs(rel)
  const body = blockAfter(src, 'export const spacingScale') ?? ''
  for (const [, key] of body.matchAll(/^\s*([A-Za-z0-9.]+)\s*:/gm)) {
    if (key === 'd') continue
    out.push(row('spacing', rel, `spacingScale.${key}`, 'density-aware step',
      `Tailwind p-${key} / gap-${key} / m-${key}. Prefer an inset-* / stack-* / row-* intent when the surface has a name.`))
  }
  return out
}

function loadTypographyTokens() {
  const out = []
  const twRel = TOKEN_TS.tailwind
  const tw = readTs(twRel)
  for (const [, name] of tw.matchAll(/^\s+'(text-role-[a-z]+)'\s*,/gm)) {
    out.push(row('typography', twRel, name, 'role',
      `className="${name}" — type ROLE, not text-[Npx] or text-sm. Import nothing; it is a utility.`))
  }

  const presetRel = TOKEN_TS.typePresets
  const presets = readTs(presetRel)
  for (const [, name] of presets.matchAll(/^export const ([A-Za-z]+)\s*=/gm)) {
    if (name === 'typographyPresets') continue
    out.push(row('typography', presetRel, name, 'preset',
      `import { ${name} } from '@/design-system/tokens/typography/presets' — composed face, not a hand-rolled size/weight/tracking stack.`))
  }

  const sizeRel = TOKEN_TS.typeSizes
  const sizes = readTs(sizeRel)
  for (const [key] of quotedMap(sizes, 'export const fontSizes')) {
    out.push(row('typography', sizeRel, `fontSizes.${key}`, 'scale',
      'Raw size scale. Prefer a text-role-* utility or a typography preset over this.'))
  }
  return out
}

function loadZIndexTokens() {
  const rel = TOKEN_TS.zIndex
  const src = readTs(rel)
  const body = blockAfter(src, 'export const zIndex') ?? ''
  const out = []
  for (const [, key] of body.matchAll(/^\s*([A-Za-z]+)\s*:/gm)) {
    out.push(row('z-index', rel, `z-${key}`, 'named band',
      `className="z-${key}" — import nothing. Never z-[NNN]; if two layers share a band, zIndex.${key} + N in JS, not a new magic number.`))
  }
  return out
}

function loadElevationTokens() {
  const rel = TOKEN_TS.elevation
  const src = readTs(rel)
  if (!src) return []
  const out = []
  const body = blockAfter(src, 'export const ELEVATION_CLASS') ?? ''
  const raised = blockAfter(body, 'raised:') ?? ''
  for (const [, intensity, cls] of raised.matchAll(/^\s*'?([a-z]+)'?\s*:\s*'([^']*)'/gm)) {
    const call = intensity === 'default' ? "elevationClass('raised')" : `elevationClass('raised', '${intensity}')`
    out.push(row('elevation', rel, call, cls,
      `cn(${call}) — import { elevationClass } from '@/design-system/tokens/shadows'. Never hand-roll shadow-* / shadow-scrim.`))
  }
  // Depth-0 keys only — nested raised.soft / raised.default must not become roles.
  for (const [, role, cls] of body.matchAll(/^  ([a-z]+):\s*'([^']*)'/gm)) {
    out.push(row('elevation', rel, `elevationClass('${role}')`, cls || 'flat (no shadow)',
      `cn(elevationClass('${role}')) — import { elevationClass } from '@/design-system/tokens/shadows'.`))
  }
  return out
}

function loadFocusTokens() {
  const rel = TOKEN_TS.focus
  const src = readTs(rel)
  if (!src) return []
  const archetypes = unionMembers(src, 'FocusArchetype')
  const tones = unionMembers(src, 'FocusTone')
  const out = []
  for (const a of archetypes) {
    out.push(row('focus', rel, `focusRing('${a}')`, 'recipe',
      `cn(focusRing('${a}')) — import { focusRing } from '@/design-system/tokens/focus-ring'. Default tone accent. Other tones: ${tones.join(', ')}. Never hand-roll focus:ring-*.`))
  }
  return out
}

function loadBorderTokens() {
  const rel = TOKEN_TS.border
  const src = readTs(rel)
  if (!src) return []
  const out = []
  for (const [key, value] of quotedMap(src, 'export const borderWidths')) {
    out.push(row('border', rel, `borderWidths.${key}`, value,
      "Prefer semantic utilities (border-border-soft, border-border-hairline) over a raw width. This is the typed scale."))
  }
  for (const [key, value] of quotedMap(src, 'export const borderStyles')) {
    out.push(row('border', rel, `borderStyles.${key}`, value,
      'Border style scale. Pair with a semantic border colour token, not a hex.'))
  }
  return out
}

const STATION_SKIN_CLASS = {
  header: 'bg-surface-station-header',
  well: 'bg-surface-station-well',
  plate: 'bg-surface-station-plate',
  slot: 'bg-surface-station-slot',
  bar: 'bg-surface-station-bar',
  'row-hover': 'hover:bg-surface-station-row-hover',
  'header-hover': 'hover:bg-surface-station-header-hover',
  'bevel-shadow': 'border-station-shadow',
  'bevel-highlight': 'border-station-highlight',
  ink: 'text-[color:var(--ds-station-ink)]',
  'ink-muted': 'text-[color:var(--ds-station-ink-muted)]',
}

/**
 * Scan-station skin law. Names and `--ds-station-*` vars are the answer;
 * character hexes stay in station-skins.ts and must never leak into this
 * payload (an agent would paste them onto Unbox). Color only — Depth is
 * `station-depth`.
 */
function loadStationSkinTokens() {
  const rel = TOKEN_TS.stationSkins
  const src = readTs(rel)
  if (!src) return []
  const out = []

  const varKeys = arrayAfter(src, 'export const STATION_SKIN_VAR_KEYS')
  for (const key of varKeys) {
    const cls = STATION_SKIN_CLASS[key] ?? `var(--ds-station-${key})`
    out.push(row(
      'station-skin',
      rel,
      `--ds-station-${key}`,
      'per station-skin',
      `className="${cls}" — consume STATION_SCAN_* from @/components/station/scan-depth; do not retype the fill.`,
    ))
  }

  const skinsBody = blockAfter(src, 'export const STATION_SKINS')
  if (!skinsBody) {
    throw new Error(`${rel} has no STATION_SKINS record — station-skin reader fault, not a licence to invent a fill.`)
  }
  const names = keysAtTopLevel(skinsBody)
  if (names.length === 0) {
    throw new Error(`${rel} STATION_SKINS parsed zero skins — station-skin reader fault.`)
  }
  for (const name of names) {
    const nested = objectAfterKey(skinsBody, name) ?? ''
    const label = /(?:^|\n)\s*label:\s*'([^']+)'/.exec(nested)?.[1]
    const group = /(?:^|\n)\s*group:\s*'([^']+)'/.exec(nested)?.[1]
    const hint = /(?:^|\n)\s*hint:\s*'([^']+)'/.exec(nested)?.[1]
    const bits = [label ?? name, group ?? 'ungrouped', 'Color']
    const extra = name === 'industrial'
      ? ' Default mill — ABSENCE of data-station-skin.'
      : name === 'house-color'
        ? ' Plate mixes --ds-color-accent-bg; bevels stay mill.'
        : ''
    out.push(row(
      'station-skin',
      rel,
      `applyStationSkin('${name}')`,
      bits.join(' · '),
      `applyStationSkin('${name}') — import from @/lib/theme/station-skin. Appearance lists STATION_SKIN_NAMES.${hint ? ` ${hint}` : ''}${extra}`,
    ))
  }
  return out
}

/**
 * Scan-station depth law. Flat | Mill | Deep — bevel width + grain.
 * Independent of Color (`station-skin`).
 */
function loadStationDepthTokens() {
  const rel = TOKEN_TS.stationDepths
  const src = readTs(rel)
  if (!src) return []
  const out = []
  out.push(row(
    'station-depth',
    rel,
    '--ds-station-bevel-width',
    'per station-depth',
    'border-[length:var(--ds-station-bevel-width)] via STATION_SCAN_* / STATION_DISPLAYS_* in scan-depth.ts.',
  ))
  out.push(row(
    'station-depth',
    rel,
    'station-scan-grain',
    'Deep only',
    "Grain paints only under html[data-station-depth='deep'] .station-scan-grain — not per Color.",
  ))
  const depthsBody = blockAfter(src, 'export const STATION_DEPTHS')
  if (!depthsBody) {
    throw new Error(`${rel} has no STATION_DEPTHS record — station-depth reader fault.`)
  }
  const names = keysAtTopLevel(depthsBody)
  if (names.length === 0) {
    throw new Error(`${rel} STATION_DEPTHS parsed zero depths — station-depth reader fault.`)
  }
  for (const name of names) {
    const nested = objectAfterKey(depthsBody, name) ?? ''
    const label = /(?:^|\n)\s*label:\s*'([^']+)'/.exec(nested)?.[1]
    const hint = /(?:^|\n)\s*hint:\s*'([^']+)'/.exec(nested)?.[1]
    const extra = name === 'mill'
      ? ' Default — ABSENCE of data-station-depth.'
      : ''
    out.push(row(
      'station-depth',
      rel,
      `applyStationDepth('${name}')`,
      label ?? name,
      `applyStationDepth('${name}') — import from @/lib/theme/station-depth. Appearance lists STATION_DEPTH_NAMES.${hint ? ` ${hint}` : ''}${extra}`,
    ))
  }
  return out
}

/**
 * Named ds_tokens queries on axis item-record. Each maps to a token-name
 * substring so `query: "meta"` is the phone qty·condition·notes cluster, not
 * a dump of FACE + STAGE + TITLE. Unknown query is an error — not a filter.
 */
const ITEM_RECORD_QUERIES = {
  meta: 'MOBILE_META',
  thumb: 'MOBILE_THUMB',
  stage: 'MOBILE_STAGE',
  title: 'MOBILE_TITLE',
}

/**
 * Phone item-record faces. Qty · condition · notes is ONE cluster; Pick /
 * Packed is PackageSearch / Package + Assigned or stamp. Padded thumb and
 * two-line title live on ITEM_RECORD_MOBILE_*.
 */
function loadItemRecordTokens() {
  const out = []
  const maps = [
    {
      rel: TOKEN_TS.itemRecordFace,
      anchor: 'export const ITEM_RECORD_FACE',
      prefix: 'ITEM_RECORD_FACE',
      use: 'Flush ledger thumb geometry (ItemRecordRow). Phone to-ship uses ITEM_RECORD_MOBILE_THUMB + ItemRecordThumb variant=padded. Query ds_tokens({ axis: "item-record", query: "thumb" }).',
    },
    {
      rel: TOKEN_TS.itemRecordMobile,
      anchor: 'export const ITEM_RECORD_MOBILE_THUMB',
      prefix: 'ITEM_RECORD_MOBILE_THUMB',
      use: 'Padded cornered phone photo. ItemRecordThumb variant="padded" inside ITEM_RECORD_MOBILE_THUMB.column. Never flush-bleed the cube on the to-ship card. Query ds_tokens({ axis: "item-record", query: "thumb" }).',
    },
    {
      rel: TOKEN_TS.itemRecordMobile,
      anchor: 'export const ITEM_RECORD_MOBILE_TITLE',
      prefix: 'ITEM_RECORD_MOBILE_TITLE',
      use: 'Two-line reserved title; meta+stage pin to the foot so a one-line title does not shift the cluster. Query ds_tokens({ axis: "item-record", query: "title" }).',
    },
    {
      rel: TOKEN_TS.itemRecordMobile,
      anchor: 'export const ITEM_RECORD_MOBILE_META',
      prefix: 'ITEM_RECORD_MOBILE_META',
      use: 'Qty · condition · notes as one sunken token. Mount ItemRecordMobileMeta. Never three independent chips, never SKU/serial/price on the phone card (that is ItemRecordMetaGrid on the desk). Query ds_tokens({ axis: "item-record", query: "meta" }).',
    },
    {
      rel: TOKEN_TS.itemRecordMobile,
      anchor: 'export const ITEM_RECORD_MOBILE_STAGE',
      prefix: 'ITEM_RECORD_MOBILE_STAGE',
      use: 'Phone Pick / Packed — same face as desk CompoundStageStep without the avatar. PackageSearch + Package glyphs; pending Assigned; done stamp. Names stay on the order sheet. Query ds_tokens({ axis: "item-record", query: "stage" }).',
    },
    {
      rel: TOKEN_TS.itemRecordMobile,
      anchor: 'export const ITEM_RECORD_MOBILE_STAGE_VERBS',
      prefix: 'ITEM_RECORD_MOBILE_STAGE_VERBS',
      use: 'Done verbs Picked / Packed + pending Assigned. Never a staff name. Import from @/design-system/tokens/item-record-mobile.',
    },
    {
      rel: TOKEN_TS.itemRecordMobile,
      anchor: 'export const ITEM_RECORD_MOBILE_STAGE_ICONS',
      prefix: 'ITEM_RECORD_MOBILE_STAGE_ICONS',
      use: 'Pick = package-search (PackageSearch). Packed = package (Package). Same catalog iconKey as orders.picked / orders.packed.',
    },
  ]
  for (const spec of maps) {
    const src = readTs(spec.rel)
    if (!src) {
      throw new Error(`${spec.rel} missing — item-record reader fault, not a licence to invent a chip.`)
    }
    const pairs = quotedMap(src, spec.anchor)
    if (pairs.length === 0) {
      throw new Error(`${spec.rel} ${spec.prefix} parsed zero keys — item-record reader fault.`)
    }
    for (const [key, value] of pairs) {
      out.push(row('item-record', spec.rel, `${spec.prefix}.${key}`, value, spec.use))
    }
  }
  return out
}

const AXIS_LOADERS = {
  color: loadThemeTokens,
  radius: loadRadiusTokens,
  spacing: loadSpacingTokens,
  typography: loadTypographyTokens,
  'z-index': loadZIndexTokens,
  elevation: loadElevationTokens,
  border: loadBorderTokens,
  focus: loadFocusTokens,
  'station-skin': loadStationSkinTokens,
  'station-depth': loadStationDepthTokens,
  'item-record': loadItemRecordTokens,
}

const AXIS_NOTE = {
  color:
    'Colour values read "per theme" because they resolve at runtime from themes/registry.ts — write var(--ds-color-…), never a hex.',
  radius:
    "Prefer the ROLE (cornerClass('surface')) over the class it currently renders. " +
    "The industrial ladder (flush…canvas) is rounded-none. Composer chrome is COMPOSER_SHELL_CORNER, " +
    "a named literal, not a role — inner = outer − padding, but do not call cornerClass for that nest.",
  spacing:
    'Prefer an inset-* / stack-* / row-* intent over a raw p-* / gap-* when the surface has a name.',
  typography:
    'Prefer text-role-* or a typography preset over text-sm / text-[Npx].',
  'z-index':
    'Prefer z-panel / z-modal / z-tooltip over z-[NNN].',
  elevation:
    "Prefer elevationClass('flat'|'raised'|'overlay') over shadow-* / shadow-scrim.",
  border:
    'Prefer semantic border-border-* utilities over a hex or an arbitrary width.',
  focus:
    "Prefer focusRing(archetype, tone) over a hand-rolled focus:ring-* recipe.",
  'station-skin':
    "Scan-station Color is a row in station-skins.ts, not a hex on Unbox. " +
    "Call applyStationSkin(name); wells use STATION_SCAN_* / --ds-station-*. " +
    "Industrial is the absence of data-station-skin. Character hexes live in the catalog file only. " +
    "Grain and bevel width are station-depth — do not bake them onto a color row.",
  'station-depth':
    "Scan-station Depth is flat | mill | deep in station-depths.ts. " +
    "Call applyStationDepth(name). Mill is the absence of data-station-depth. " +
    "Grain paints only at Deep. Independent of Color (station-skin).",
  'item-record':
    "Phone item-record queries: ds_tokens({ axis: 'item-record', query: 'meta' | 'thumb' | 'stage' | 'title' }). " +
    "META = qty · condition · notes as one sunken token (ItemRecordMobileMeta). " +
    "THUMB = padded rounded photo (ItemRecordThumb variant=padded). " +
    "TITLE = two-line reserved title + foot so the cluster does not jump. " +
    "STAGE = PackageSearch / Package + Assigned or picked/packed stamp (desk CompoundStageStep; names on the sheet). " +
    "Do not mount ItemRecordMetaGrid (desk five-track) on the phone card.",
}

/**
 * Colour values never leave this process as a hex. The parser writes
 * "per theme" already; this scrubber is the last line of defence if a
 * reader starts pulling CSS again. Smoke plants `#1a1a1d` with
 * DESIGN_MCP_PLANT_HEX=1 (skips the scrubber) to prove the check is live.
 */
const COLOR_HEX_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\(/i
function scrubColorValue(value) {
  return COLOR_HEX_RE.test(String(value)) ? 'per theme' : value
}

function requireAxis(raw) {
  const axis = raw == null || raw === '' ? null : String(raw)
  if (!axis || axis === 'all' || axis === 'other') {
    throw new Error(
      `ds_tokens requires axis — one of: ${TOKEN_AXES.join(', ')}. ` +
        'A dump of every axis is not a lookup; name the axis you are about to write.',
    )
  }
  if (!TOKEN_AXES.includes(axis)) {
    throw new Error(`unknown axis "${axis}" — one of: ${TOKEN_AXES.join(', ')}`)
  }
  return axis
}

function loadAxis(axis) {
  const loader = AXIS_LOADERS[axis]
  const rows = loader ? loader() : []
  if (axis === 'color' && process.env.DESIGN_MCP_PLANT_HEX !== '1') {
    for (const t of rows) t.value = scrubColorValue(t.value)
  }
  if (axis === 'station-skin') {
    for (const t of rows) t.value = scrubColorValue(t.value)
  }
  if (axis === 'station-depth') {
    for (const t of rows) t.value = scrubColorValue(t.value)
  }
  return rows
}

function presentAxis(axis, filter, query) {
  let needle = filter ? String(filter).toLowerCase() : null
  let resolvedQuery = null
  if (query != null && String(query).trim() !== '') {
    if (axis !== 'item-record') {
      throw new Error(
        `ds_tokens query is the item-record named lookup (${Object.keys(ITEM_RECORD_QUERIES).join('|')}). ` +
          'Other axes take filter, not query.',
      )
    }
    const key = String(query).trim().toLowerCase()
    const mapped = ITEM_RECORD_QUERIES[key]
    if (!mapped) {
      throw new Error(
        `unknown item-record query "${query}" — one of: ${Object.keys(ITEM_RECORD_QUERIES).join(', ')}`,
      )
    }
    resolvedQuery = key
    needle = mapped.toLowerCase()
  }
  const rows = loadAxis(axis)
    .filter((t) => (needle ? t.name.toLowerCase().includes(needle) : true))
    .map((t) => ({
      token: t.name,
      value: t.value,
      axis,
      source: t.source,
      ...(t.use ? { use: t.use } : {}),
      ...(t.duplicates?.length ? { alsoDefinedIn: t.duplicates } : {}),
    }))
  if (rows.length === 0) {
    throw new Error(
      `no tokens on axis "${axis}"${needle ? ` matching "${resolvedQuery ?? filter}"` : ''} — this is a reader fault, not a licence ` +
        'to write a literal. Say so rather than inventing a value.',
    )
  }
  return {
    axis,
    ...(resolvedQuery ? { query: resolvedQuery } : {}),
    count: rows.length,
    sources: [...new Set(rows.map((r) => r.source))],
    tokens: rows,
    note: `Use the token, not the literal. ${AXIS_NOTE[axis]}`,
  }
}

// ── ranking ──────────────────────────────────────────────────────────────────

const STOP = new Set(['a', 'an', 'the', 'for', 'of', 'to', 'in', 'on', 'and', 'or', 'with', 'that', 'this', 'is', 'my'])
const terms = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t))

function variantNotesFromBlock(vBlock, variantNames) {
  const allowed = new Set(variantNames)
  const notes = {}
  for (const m of vBlock.matchAll(/([A-Za-z0-9_-]+)\s*:\s*'([^']*)'/g)) {
    if (allowed.has(m[1])) notes[m[1]] = m[2]
  }
  return notes
}

/** Class-string maps (Button) are not the law; prose notes (DateRangePickerField) are. */
function isProseVariantNote(note) {
  const s = String(note ?? '')
  if (!s.includes(' ')) return false
  if (/\b(bg|text|hover|active|ring|shadow|flex|inline)-/.test(s)) return false
  return true
}

/**
 * Rank a catalogued variant against the job. `compact` vs `range` is the
 * ship-by vs filter split — without this, agents mount the default range
 * (presets + Apply + X + year) into a table cell.
 */
function recommendVariant(entry, q) {
  const names = entry.variant_axes?.variant ?? []
  if (names.length === 0) return null
  const notes = entry.variant_notes ?? {}
  let best = null
  let bestScore = 0
  for (const name of names) {
    let s = 0
    const blob = terms(`${name} ${notes[name] ?? ''}`).join(' ')
    for (const t of q) {
      if (name === t) s += 14
      else if (blob.includes(t)) s += 8
    }
    if (s > bestScore) {
      bestScore = s
      best = { name, note: notes[name] ?? '', score: s }
    }
  }
  if (!best || bestScore === 0) return null
  return best
}

function score(entry, q, override) {
  const id = entry.id.toLowerCase()
  const useWhen = terms(override?.useWhen ?? '').join(' ')
  const home = String(entry.home ?? '').toLowerCase()
  let s = 0
  for (const t of q) {
    if (id === t) s += 12
    else if (id.includes(t)) s += 6
    if (useWhen.includes(t)) s += 10
    if (entry.file.toLowerCase().includes(t)) s += 2
    if (home.includes('shadcn') && (t === 'shadcn' || t === '21st' || t === 'primitive')) s += 8
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

/**
 * `re` alone is the signal. `and` narrows it: BOTH must match, and the report
 * still points at `re`'s line.
 *
 * A composer needs `and` and nothing else does. A raw `<textarea>` is not a
 * fork — 49 files in this repo have one and almost all are ordinary form
 * fields on a record. What makes it a composer is a textarea that ALSO owns a
 * send: an Enter-commits handler, a commit callback, or a "type a message"
 * placeholder. Signalling on the textarea alone would cry wolf on every
 * settings page and get the whole detector ignored.
 */
const FORK_SIGNALS = [
  { pin: 'Button', also: ['button'], re: /<button[\s>]/, what: 'a raw <button>' },
  { pin: 'TextField', also: ['input'], re: /<input[\s>]/, what: 'a raw <input>' },
  { pin: 'Checkbox', also: ['checkbox'], re: /type=["']checkbox["']/, what: 'a raw checkbox input' },
  { pin: 'Dialog', also: ['dialog'], re: /role=["']dialog["']/, what: 'a hand-rolled dialog role' },
  { pin: 'HoverTooltip', also: ['popover'], re: /role=["']tooltip["']/, what: 'a hand-rolled tooltip role' },
  { pin: 'station-skins', re: /\bbg-surface-(trough|bench|plate|slot)\b/, what: 'a packing-bench fill class' },
  {
    pin: 'OmnichannelComposerDock',
    also: ['TicketComposer', 'StationComposerHost'],
    re: /<textarea[\s>]/,
    and: /key === ['"]Enter['"]|Enter to send|handleComposerKeyDown|onCommit|placeholder=["'{][^"'}]*(message|reply|comment|write a|ask|type a)/i,
    what: 'a hand-rolled composer (a raw <textarea> that owns its own send)',
  },
  {
    pin: 'TicketComposer',
    also: ['StationComposerHost'],
    re: /\bisPublic\b|\bemailCcs\b/,
    and: /<textarea[\s>]|OmnichannelComposerDock/,
    what: 'a second ticket composer (its own public/internal channel)',
  },
]

const THEME_CATALOG_DIR = 'src/design-system/themes/'

function isThemeCatalog(rel) {
  return rel.replaceAll('\\', '/').startsWith(THEME_CATALOG_DIR)
}

function importsScanDepth(source) {
  return /@\/components\/station\/scan-depth|STATION_SCAN_(WELL|BENCH|FIELD_WELL|ACTIVE_WELL)_CLASS/.test(source)
}

/**
 * One problem per axis, matching ds_tokens slices. A single "use var(--token)"
 * dump is how agents invent hexes on a radius file.
 */
const LITERAL_PATTERNS = [
  {
    kind: 'arbitrary type size',
    axis: 'typography',
    re: /text-\[\d+(\.\d+)?(px|rem|em)\]/g,
    fix: "ds_tokens({ axis: 'typography' }) — use text-role-* or a named preset, not text-[Npx].",
  },
  {
    kind: 'arbitrary z-index',
    axis: 'z-index',
    re: /z-\[\d+\]/g,
    fix: "ds_tokens({ axis: 'z-index' }) — use z-modal / z-tooltip / …, not z-[N].",
  },
  {
    kind: 'hardcoded hex',
    axis: 'color',
    re: /#[0-9a-fA-F]{3,8}\b/g,
    fix: "ds_tokens({ axis: 'color' }) — var(--ds-color-…); value is per theme, never a hex.",
  },
  {
    kind: 'arbitrary radius',
    axis: 'radius',
    re: /rounded-\[\d+(\.\d+)?px\]/g,
    fix: "ds_tokens({ axis: 'radius' }) — cornerClass('role'), not rounded-[Npx].",
  },
  {
    kind: 'inline style object',
    axis: null,
    re: /style=\{\{/g,
    fix: 'Tokens live in TypeScript roles (cornerClass, elevationClass, focusRing), not style={{}}.',
  },
]

/**
 * Idle↔overlay cohort workspaces (SoT =
 * `SCAN_STATION_OVERLAY_COHORT` in scan-station-overlay-cohort.ts).
 * Keep in sync when the cohort grows — design-mcp cannot import the TS module.
 */
const OVERLAY_COHORT_WORKSPACES = new Set([
  'src/components/receiving/unbox/UnboxLineWorkspace.tsx',
  'src/components/receiving/triage/TriageLineWorkspace.tsx',
  'src/components/packer/PackOrderWorkspace.tsx',
  'src/components/tech/TestingLineWorkspace.tsx',
  'src/components/tech/TechRightPane.tsx',
  'src/components/outbound/workspaces/ScanOutWorkspace.tsx',
])

/** Cohort-law styles: visibility hide + zIndex.panel stack — not token drifts. */
function isOverlayCohortAllowedStyleObject(slice) {
  if (
    /style=\{\{\s*visibility:/.test(slice) &&
    /['"]hidden['"]/.test(slice) &&
    /['"]visible['"]/.test(slice)
  ) {
    return true
  }
  if (/style=\{\{\s*zIndex:\s*zIndex\.panel\b/.test(slice)) return true
  return false
}

/**
 * Collect `style={{` hits; in cohort workspaces, skip visibility / zIndex.panel.
 */
function inlineStyleHits(source, rel) {
  const norm = rel.replaceAll('\\', '/')
  const inCohort = OVERLAY_COHORT_WORKSPACES.has(norm)
  const hits = []
  const re = /style=\{\{/g
  let m
  while ((m = re.exec(source)) !== null) {
    const slice = source.slice(m.index, Math.min(source.length, m.index + 180))
    if (inCohort && isOverlayCohortAllowedStyleObject(slice)) continue
    hits.push(m[0])
  }
  return hits
}

const TRIAGE_LAYOUT_FILES = new Set([
  'src/design-system/components/TriageScrollLayout.tsx',
  'src/design-system/components/TriageSections.tsx',
  'src/design-system/components/TriageScrollKnobs.tsx',
])

function importsTriageScrollLayout(source) {
  return /(?:from\s+['"][^'"]*TriageScrollLayout['"]|import\s*\{[^}]*TriageScrollLayout[^}]*\}\s*from)/.test(source)
}

/**
 * Heuristic (not a TS AST): files that import TriageScrollLayout must not
 * invent a raw flush or px radius on the right pane. The law is
 * `cornerClass('surface')`.
 */
function critiqueTriageLayout(source, rel) {
  if (TRIAGE_LAYOUT_FILES.has(rel.replaceAll('\\', '/'))) return []
  if (!importsTriageScrollLayout(source)) return []
  const problems = []
  if (/\brounded-none\b/.test(source)) {
    problems.push({
      severity: 'drifts-from-tokens',
      line: lineOf(source, 'rounded-none'),
      what: 'raw rounded-none in a TriageScrollLayout consumer — right-pane panels must use cornerClass(\'surface\')',
      fix: "Import { cornerClass } from '@/design-system/tokens/radius' and apply cornerClass('surface').",
      confidence: 'heuristic',
    })
  }
  const pxHit = source.match(/rounded-\[\d+(\.\d+)?px\]/)
    ?? source.match(/borderRadius\s*:\s*\d+/)
    ?? source.match(/border-radius\s*:\s*\d+px/)
  if (pxHit) {
    problems.push({
      severity: 'drifts-from-tokens',
      line: lineOf(source, pxHit[0]),
      what: `hardcoded border-radius integer (${pxHit[0]}) in a TriageScrollLayout consumer`,
      fix: "Import { cornerClass } from '@/design-system/tokens/radius' and apply cornerClass('surface').",
      confidence: 'heuristic',
    })
  }
  const rawRound = source.match(/\brounded-(sm|md|lg|xl|2xl|3xl)\b/)
  if (rawRound) {
    problems.push({
      severity: 'drifts-from-tokens',
      line: lineOf(source, rawRound[0]),
      what: `raw ${rawRound[0]} in a TriageScrollLayout consumer — agents retrieve cornerClass('surface'), not a guessed rounded-* class`,
      fix: "Import { cornerClass } from '@/design-system/tokens/radius' and apply cornerClass('surface').",
      confidence: 'heuristic',
    })
  }
  return problems
}

const lineOf = (text, needle) => (needle && text.includes(needle) ? text.slice(0, text.indexOf(needle)).split('\n').length : null)

// ── tools ────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'ds_contract',
    description:
      'Use this BEFORE writing any React component, to find the UI primitives that already exist (Buttons, ' +
      'Composers, chips, dialogs, date fields). Returns the exact import path, the real variant options, ' +
      'and the usage laws where a human has written them. When pickVariant/mount are set, mount THAT face ' +
      '(ship-by / in-cell date is DateRangePickerField variant="compact", not the range filter). ' +
      'New composed / 21st.dev work starts from the shadcn primitives in @/components/ui (home label ' +
      '"shadcn primitive"). Ops CTAs still take Button from @/design-system/primitives/Button. ' +
      'Describe the job in plain words ("row of actions", "status chip", "ship-by date in a table cell", ' +
      '"confirm a destructive action") and this returns the matching primitives. If something here covers the job, building beside it is a fork.',
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
      'Look up the exact class or value on ONE visual axis before you type a literal. ' +
      'axis is required — a dump of every axis is not a lookup. Never invent a hex, a px radius, ' +
      'or text-[Npx] if this returns a token. On radius call cornerClass(role); on colour write var(--ds-color-…); ' +
      'on elevation call elevationClass; on focus call focusRing; on station-skin call applyStationSkin(name); ' +
      'on station-depth call applyStationDepth(name) ' +
      'and consume STATION_SCAN_* — never hex a well or fork a packing-bench fill on one station. ' +
      'On item-record: query "meta" (qty·condition·notes one token), "thumb" (padded photo), ' +
      '"title" (two-line reserved title), "stage" (PackageSearch/Package + Assigned or stamp). ' +
      'Mount ItemRecordMobileMeta + ItemRecordMobileStage + ItemRecordThumb variant=padded.',
    inputSchema: {
      type: 'object',
      properties: {
        axis: {
          type: 'string',
          enum: TOKEN_AXES,
          description: 'The axis you are about to write. Required. There is no "all".',
        },
        filter: { type: 'string', description: 'Substring match on the token name, e.g. "surface" or "sunken".' },
        query: {
          type: 'string',
          enum: ['meta', 'thumb', 'stage', 'title'],
          description:
            'item-record named query. meta = qty·condition·notes one cluster; thumb = padded corner photo; ' +
            'stage = PackageSearch/Package + Assigned or stamp; title = two-line reserved title + foot. ' +
            'Only valid with axis item-record.',
        },
      },
      required: ['axis'],
    },
  },
  {
    name: 'ds_critique',
    description:
      'Use this AFTER writing or editing a UI file, on that file, before you call the work done. ' +
      'Ask "why is this component bad?" for one file and get the blunt answer: hand-rolled primitives that ' +
      'fork something the system already has, arbitrary literals used where tokens exist (each problem names ' +
      'the ds_tokens axis and the role call — cornerClass, text-role-*, var(--ds-color-…), never a generic ' +
      'var(--token)), whether it uses the design system at all, and its size. Reads the file from disk.',
    inputSchema: {
      type: 'object',
      properties: { file_path: { type: 'string', description: 'Repo-relative path, e.g. "src/components/composer/StationComposerHost.tsx".' } },
      required: ['file_path'],
    },
  },
]

const TOKEN_RESOURCE_PREFIX = 'design://tokens/'

function tokenResources() {
  return TOKEN_AXES.map((axis) => ({
    uri: `${TOKEN_RESOURCE_PREFIX}${axis}`,
    name: `tokens/${axis}`,
    mimeType: 'application/json',
    description: `Same payload as ds_tokens({ axis: "${axis}" }). Browse; the tool is the query with a filter.`,
  }))
}

const server = new Server(
  { name: 'cycleforge-design-mcp', version: '0.2.0' },
  { capabilities: { tools: {}, resources: {} } },
)
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))
server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: tokenResources() }))
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [] }))
server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = String(req.params?.uri ?? '')
  if (!uri.startsWith(TOKEN_RESOURCE_PREFIX)) {
    throw new Error(`unknown resource ${uri} — token slices live at ${TOKEN_RESOURCE_PREFIX}<axis>`)
  }
  const axis = requireAxis(uri.slice(TOKEN_RESOURCE_PREFIX.length))
  const payload = presentAxis(axis)
  return {
    contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(payload, null, 2) }],
  }
})

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
        .map((e) => {
          const pick = recommendVariant(e, q)
          let s = score(e, q, overrides[e.id])
          if (pick) s += Math.min(pick.score, 16)
          return { e, s, pick }
        })
        .filter((h) => h.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map(({ e, pick }) => {
          const { variant_notes: _notes, ...rest } = e
          const out = { ...rest, ...(overrides[e.id] ?? {}) }
          if (pick) {
            out.pickVariant = pick.name
            out.mount = `<${e.id} variant="${pick.name}" />`
            if (isProseVariantNote(pick.note)) out.pickVariantNote = pick.note
          }
          return out
        })

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
              'When pickVariant is set, mount THAT face — not a sibling and not the default. ' +
              'pickVariantNote is the law for that face (ship-by / in-cell date is compact; filter range is range). ' +
              'useWhen/doNot appear only where a human has curated them in src/design-system/pinned.json — ' +
              'their absence means nobody has written the law yet, NOT that anything is permitted. ' +
              'New composed / 21st.dev work starts from matches whose home is "shadcn primitive". ' +
              'Ops CTAs still take design-system Button, not ui/button.',
      })
    }

    if (name === 'ds_tokens') {
      return json(presentAxis(requireAxis(args.axis), args.filter))
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
      problems.push(...critiqueTriageLayout(source, rel))
      if (!isPrimitiveHome) {
        for (const s of FORK_SIGNALS) {
          const alreadyUses = used.includes(s.pin) || (s.also ?? []).some((id) => used.includes(id))
          if (!s.re.test(source) || alreadyUses) continue
          if (s.and && !s.and.test(source)) continue
          const e = byId.get(s.pin)
          const stationSkinFork = s.pin === 'station-skins'
          problems.push({
            severity: 'forks-the-system',
            line: lineOf(source, (source.match(s.re) ?? [])[0]),
            what: `${s.what} where the system has ${s.pin}`,
            fix: stationSkinFork
              ? "ds_tokens({ axis: 'station-skin' }) — add a STATION_SKINS row; wells consume STATION_SCAN_* from @/components/station/scan-depth."
              : e ? `Import ${s.pin} from ${e.import}` : `Use the existing ${s.pin}.`,
            confidence: 'heuristic',
          })
        }
      }

      let literalTotal = 0
      const catalog = isThemeCatalog(rel)
      for (const { kind, axis, re, fix } of LITERAL_PATTERNS) {
        if (kind === 'hardcoded hex' && catalog) continue
        let hits
        if (kind === 'inline style object') {
          hits = inlineStyleHits(source, rel)
        } else {
          hits = source.match(new RegExp(re.source, 'g')) ?? []
        }
        if (!hits.length) continue
        literalTotal += hits.length
        const scanPaintHex = kind === 'hardcoded hex' && importsScanDepth(source)
        problems.push({
          severity: 'drifts-from-tokens',
          ...((scanPaintHex ? 'station-skin' : axis) ? { axis: scanPaintHex ? 'station-skin' : axis } : {}),
          what: `${hits.length} ${kind} where the ${scanPaintHex ? 'station-skin' : axis ?? 'token'} axis exists`,
          detail: { examples: [...new Set(hits)].slice(0, 4) },
          fix: scanPaintHex
            ? "ds_tokens({ axis: 'station-skin' }) — add a STATION_SKINS row; wells consume STATION_SCAN_* classes, never a hex."
            : fix,
          confidence: 'heuristic',
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
      if (lines > 300 && !catalog) {
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
