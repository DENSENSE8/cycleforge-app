/**
 * Smoke test — drives the server over real stdio JSON-RPC.
 *
 * Catches the failure that only appears through the transport: a diagnostic
 * printed to stdout corrupts the JSON-RPC stream and every client sees a dead
 * server while the handlers themselves test green.
 *
 * Run: node tools/design-mcp/smoke.mjs
 */
import { spawn } from 'node:child_process'
import { rmSync, symlinkSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')

// A link that lives inside the repo and points out of it. `path.resolve` calls
// this in-repo, so containment that never realpaths reads /etc/passwd happily.
const LINK_REL = 'src/shell/__ds_smoke_link.tsx'
const LINK_ABS = path.join(REPO, LINK_REL)
try { rmSync(LINK_ABS) } catch {}
symlinkSync('/etc/passwd', LINK_ABS)
const cleanup = () => { try { rmSync(LINK_ABS) } catch {} }
process.on('exit', cleanup)

/** Tiny RPC: initialize + one ds_tokens color call. Used to plant a hex. */
function colorValuesWithEnv(extraEnv) {
  return new Promise((resolve) => {
    const p = spawn(path.join(HERE, 'run-mcp.sh'), [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...extraEnv },
    })
    let buf = ''
    p.stdout.on('data', (d) => { buf += d })
    const send = (o) => p.stdin.write(JSON.stringify(o) + '\n')
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'plant', version: '0' } } })
    send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'ds_tokens', arguments: { axis: 'color' } } })
    setTimeout(() => {
      p.kill()
      const msgs = buf.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return {} } })
      let values = []
      try {
        values = (JSON.parse(msgs.find((m) => m.id === 2)?.result?.content?.[0]?.text ?? '{}').tokens ?? []).map((t) => t.value)
      } catch { /* empty */ }
      resolve(values)
    }, 4000)
  })
}
const plantedColorP = colorValuesWithEnv({ DESIGN_MCP_PLANT_HEX: '1' })

const child = spawn(path.join(HERE, 'run-mcp.sh'), [], { stdio: ['pipe', 'pipe', 'pipe'] })
let out = ''
child.stdout.on('data', (d) => (out += d))
child.stderr.on('data', (d) => process.stderr.write(`  [server] ${d}`))
const send = (o) => child.stdin.write(JSON.stringify(o) + '\n')

send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } } })
send({ jsonrpc: '2.0', method: 'notifications/initialized' })
send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'ds_contract', arguments: { intent: 'button', limit: 5 } } })
send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'ds_tokens', arguments: { axis: 'radius' } } })
send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'ds_critique', arguments: { file_path: 'src/shell/SessionComposer.tsx' } } })
send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'ds_critique', arguments: { file_path: '../Garisek-OS/package.json' } } })
send({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'ds_critique', arguments: { file_path: 'src/design-system/primitives/Button.tsx' } } })
send({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'ds_critique', arguments: { file_path: LINK_REL } } })
send({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'ds_tokens', arguments: { axis: 'color' } } })
send({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'ds_contract', arguments: { intent: 'triage form', limit: 5 } } })
send({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'ds_tokens', arguments: { axis: 'radius', filter: 'surface' } } })
send({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'ds_critique', arguments: { file_path: 'tools/design-mcp/fixtures/triage-layout-radius-violation.tsx' } } })
send({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'ds_tokens', arguments: {} } })
send({ jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'ds_tokens', arguments: { axis: 'all' } } })
send({ jsonrpc: '2.0', id: 15, method: 'tools/call', params: { name: 'ds_tokens', arguments: { axis: 'spacing' } } })
send({ jsonrpc: '2.0', id: 16, method: 'tools/call', params: { name: 'ds_tokens', arguments: { axis: 'typography' } } })
send({ jsonrpc: '2.0', id: 17, method: 'tools/call', params: { name: 'ds_tokens', arguments: { axis: 'elevation' } } })
send({ jsonrpc: '2.0', id: 18, method: 'tools/call', params: { name: 'ds_tokens', arguments: { axis: 'focus' } } })
send({ jsonrpc: '2.0', id: 19, method: 'tools/call', params: { name: 'ds_tokens', arguments: { axis: 'z-index' } } })
send({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'ds_tokens', arguments: { axis: 'border' } } })
send({ jsonrpc: '2.0', id: 21, method: 'resources/list', params: {} })
send({ jsonrpc: '2.0', id: 22, method: 'resources/read', params: { uri: 'design://tokens/radius' } })
send({ jsonrpc: '2.0', id: 23, method: 'tools/call', params: { name: 'ds_contract', arguments: { intent: 'edit save patch', limit: 5 } } })
send({ jsonrpc: '2.0', id: 24, method: 'tools/call', params: { name: 'ds_contract', arguments: { intent: 'jump rail edge knobs', limit: 5 } } })
send({ jsonrpc: '2.0', id: 25, method: 'tools/call', params: { name: 'ds_critique', arguments: { file_path: 'tools/design-mcp/fixtures/token-literal-violation.tsx' } } })
send({ jsonrpc: '2.0', id: 26, method: 'tools/call', params: { name: 'ds_contract', arguments: { intent: 'shadcn dialog', limit: 5 } } })
send({ jsonrpc: '2.0', id: 27, method: 'tools/call', params: { name: 'ds_contract', arguments: { intent: 'copy chip last-8 tracking serial', limit: 5 } } })
send({ jsonrpc: '2.0', id: 28, method: 'tools/call', params: { name: 'ds_contract', arguments: { intent: 'page header with title and primary action and in-page tabs', limit: 5 } } })
send({ jsonrpc: '2.0', id: 29, method: 'tools/call', params: { name: 'ds_contract', arguments: { intent: 'mount the desk frame on a route group layout', limit: 5 } } })
send({ jsonrpc: '2.0', id: 31, method: 'tools/call', params: { name: 'ds_contract', arguments: { intent: 'table status bar row counts selected', limit: 5 } } })
send({ jsonrpc: '2.0', id: 30, method: 'tools/call', params: { name: 'ds_contract', arguments: { intent: 'inline edit printed sticker label face corners', limit: 5 } } })
send({ jsonrpc: '2.0', id: 32, method: 'tools/call', params: { name: 'ds_contract', arguments: { intent: 'filter menu rail facet funnel', limit: 8 } } })
send({ jsonrpc: '2.0', id: 33, method: 'tools/call', params: { name: 'ds_contract', arguments: { intent: 'filter refinement bar hunt tiles table funnel', limit: 8 } } })
send({ jsonrpc: '2.0', id: 34, method: 'tools/call', params: { name: 'ds_contract', arguments: { intent: 'dumb station scan mouth gun only context ring', limit: 5 } } })
send({ jsonrpc: '2.0', id: 35, method: 'tools/call', params: { name: 'ds_critique', arguments: { file_path: 'src/components/outbound/workspaces/ScanOutWorkspace.tsx' } } })
send({ jsonrpc: '2.0', id: 36, method: 'tools/call', params: { name: 'ds_critique', arguments: { file_path: 'tools/design-mcp/fixtures/overlay-cohort-bad-style.tsx' } } })

await new Promise((r) => setTimeout(r, 22000))
child.kill()

const msgs = out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return { RAW: l.slice(0, 120) } } })
let fails = 0
const check = (label, ok, detail) => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) fails++ }
const byId = (id) => msgs.find((m) => m.id === id)
const body = (id) => JSON.parse(byId(id)?.result?.content?.[0]?.text ?? '{}')
const TOKEN_AXES_EXPECT = ['color', 'radius', 'spacing', 'typography', 'z-index', 'elevation', 'border', 'focus']

check('every stdout line is valid JSON-RPC', !msgs.some((m) => m.RAW), msgs.find((m) => m.RAW)?.RAW)
check('initialize', !!byId(1)?.result?.serverInfo, byId(1)?.result?.serverInfo?.name)
check('tools/list returns 3 tools', byId(2)?.result?.tools?.length === 3, (byId(2)?.result?.tools ?? []).map((t) => t.name).join(', '))

const contract = body(3)
check('ds_contract finds primitives', (contract.matches ?? []).length > 0, `${contract.catalog_size} in catalog`)

// Exact counts, because this extractor has already been wrong twice: it read
// the IMPORT of BUTTON_VARIANTS instead of its declaration (0 variants), and
// it understood only the cva shape (missing the flat map entirely).
//
// Asserted by KEY, never by count: the exact numbers (9 flat variants, 6v/4s
// cva) went stale within days and a red smoke run is how developers learn to
// ignore this server. A named variant disappearing is a real regression; a
// tenth one appearing is a Tuesday.
const dsButton = (contract.matches ?? []).find((m) => m.id === 'Button')
const dsVariants = dsButton?.variant_axes?.variant ?? []
check('flat variant map read', dsVariants.length > 0 && ['primary', 'ghost', 'danger'].every((v) => dsVariants.includes(v)),
  dsVariants.join('|'))
const uiButton = (contract.matches ?? []).find((m) => m.id === 'button')
const uiVariants = uiButton?.variant_axes?.variant ?? []
const uiSizes = uiButton?.variant_axes?.size ?? []
check('cva variant map still read',
  uiVariants.length > 0 && uiSizes.length > 0 && uiVariants.includes('ghost') && uiSizes.includes('sm'),
  `${uiVariants.length}v / ${uiSizes.length}s`)
check('ui button is labelled as a shadcn primitive',
  String(uiButton?.home ?? '').includes('shadcn'),
  uiButton?.home)
check('both primitive homes are reported', new Set((contract.matches ?? []).map((m) => m.home)).size > 1,
  [...new Set((contract.matches ?? []).map((m) => m.home))].join(' + '))

// The radius law is TypeScript (`cornerClass`), not a CSS custom property, so
// this asserts the ROLE map is reachable — a CSS-only reader answers "0 tokens"
// here and a model reads that as "no law exists".
const tokens = body(4)
const tokenNames = (tokens.tokens ?? []).map((t) => t.token)
check('ds_tokens returns the radius axis', tokenNames.length > 0, `${tokens.count} tokens`)
check('radius axis reaches the cornerClass role map',
  tokenNames.some((n) => n.startsWith("cornerClass('")),
  tokenNames.slice(0, 4).join(', '))
check('radius axis reads radius.ts not CSS',
  (tokens.sources ?? []).some((s) => String(s).endsWith('tokens/radius.ts')),
  (tokens.sources ?? []).join(', '))
check('radius axis includes every named *_CORNER constant',
  ['COMPOSER_SHELL_CORNER', 'SEGMENTED_CONTROL_CORNER', 'SEGMENTED_CONTROL_FACE_CORNER']
    .every((n) => tokenNames.includes(n)),
  tokenNames.filter((n) => n.endsWith('_CORNER')).join(', '))
check('radius axis includes COMPOSER_SHELL_CORNER',
  tokenNames.includes('COMPOSER_SHELL_CORNER'),
  tokenNames.includes('COMPOSER_SHELL_CORNER') ? 'COMPOSER_SHELL_CORNER' : tokenNames.slice(0, 4).join(', '))

const errText = (id) => byId(id)?.result?.content?.[0]?.text ?? byId(id)?.error?.message ?? ''
check('ds_tokens without axis is refused',
  byId(13)?.result?.isError === true && /requires axis/.test(errText(13)),
  errText(13).slice(0, 80))
check('ds_tokens axis=all is refused',
  byId(14)?.result?.isError === true && /requires axis/.test(errText(14)),
  errText(14).slice(0, 80))

const namesOf = (id) => (body(id).tokens ?? []).map((t) => t.token)
check('spacing axis reaches inset intents',
  namesOf(15).includes('inset-chip') && namesOf(15).includes('inset-field'),
  namesOf(15).slice(0, 6).join(', '))
check('typography axis reaches text-role-*',
  namesOf(16).some((n) => n.startsWith('text-role-')),
  namesOf(16).slice(0, 6).join(', '))
check('elevation axis reaches elevationClass',
  ['elevationClass(\'flat\')', 'elevationClass(\'raised\')', 'elevationClass(\'overlay\')'].every((n) => namesOf(17).includes(n))
  && !namesOf(17).includes("elevationClass('soft')")
  && !namesOf(17).includes("elevationClass('default')"),
  namesOf(17).join(', '))
check('focus axis reaches focusRing',
  namesOf(18).some((n) => n.startsWith("focusRing('")),
  namesOf(18).join(', '))
check('z-index axis reaches named bands',
  namesOf(19).includes('z-modal') && namesOf(19).includes('z-tooltip'),
  namesOf(19).slice(0, 8).join(', '))
check('border axis reaches the typed scale',
  namesOf(20).some((n) => n.startsWith('borderWidths.')),
  namesOf(20).join(', '))

const colorValues = (body(9).tokens ?? []).map((t) => t.value)
const COLOR_HEX = /#[0-9a-fA-F]{3,8}/
check('colour values never include a hex',
  colorValues.length > 0 && colorValues.every((v) => !COLOR_HEX.test(String(v))),
  colorValues.slice(0, 4).join(' | '))

const plantedColorValues = await plantedColorP
const plantedHexes = plantedColorValues.filter((v) => COLOR_HEX.test(String(v)))
check('a planted hex fails that same predicate',
  plantedHexes.includes('#1a1a1d'),
  plantedHexes.join(' | ') || 'no hex in planted spawn')

const resourceUris = (byId(21)?.result?.resources ?? []).map((r) => r.uri)
check('resources list one URI per axis',
  TOKEN_AXES_EXPECT.every((a) => resourceUris.includes(`design://tokens/${a}`)),
  resourceUris.join(', '))

let resourceBody = {}
try {
  resourceBody = JSON.parse(byId(22)?.result?.contents?.[0]?.text ?? '{}')
} catch { /* keep empty */ }
check('resources/read radius matches ds_tokens roles',
  (resourceBody.tokens ?? []).some((t) => String(t.token).startsWith("cornerClass('")),
  (resourceBody.tokens ?? []).slice(0, 3).map((t) => t.token).join(', '))

const crit = body(5)
check('ds_critique finds a real fork in SessionComposer',
  (crit.problems ?? []).some((p) => p.severity === 'forks-the-system'),
  (crit.problems ?? []).map((p) => p.severity).join(', '))

check('ds_critique refuses to read outside the repo', byId(6)?.result?.isError === true,
  byId(6)?.result?.content?.[0]?.text?.slice(0, 55))
check('ds_critique refuses a symlink that leaves the repo', byId(8)?.result?.isError === true,
  byId(8)?.result?.content?.[0]?.text?.slice(0, 55))

const colors = (body(9).tokens ?? []).map((t) => t.token)
check('colour axis reaches the theme registry',
  colors.some((n) => n.startsWith('--ds-color-')) && colors.some((n) => n.startsWith('--ds-color-accent-')),
  `${colors.length} colour tokens`)

const prim = body(7)
check('fork detection is OFF where primitives are defined',
  !(prim.problems ?? []).some((p) => p.severity === 'forks-the-system'),
  `${(prim.problems ?? []).length} problems, none forks`)

const triageContract = body(10)
check('ds_contract ranks TriageScrollLayout first for a triage form',
  (triageContract.matches ?? [])[0]?.id === 'TriageScrollLayout',
  (triageContract.matches ?? []).map((m) => m.id).join(', '))

const surfaceTokens = (body(11).tokens ?? []).map((t) => t.token)
check('ds_tokens radius filter reaches cornerClass(\'surface\')',
  surfaceTokens.includes("cornerClass('surface')"),
  surfaceTokens.slice(0, 6).join(', '))

const triageCrit = body(12)
check('ds_critique flags rounded-none in a TriageScrollLayout consumer',
  (triageCrit.problems ?? []).some((p) => /cornerClass\('surface'\)/.test(p.what + (p.fix ?? ''))),
  (triageCrit.problems ?? []).map((p) => p.what).join(' | '))

const editContract = body(23)
check('ds_contract ranks useOptimisticMutation for an edit',
  (editContract.matches ?? []).some((m) => m.id === 'useOptimisticMutation'),
  (editContract.matches ?? []).map((m) => m.id).join(', '))

const knobsContract = body(24)
check('ds_contract ranks TriageScrollKnobs for a jump rail',
  (knobsContract.matches ?? []).some((m) => m.id === 'TriageScrollKnobs'),
  (knobsContract.matches ?? []).map((m) => m.id).join(', '))

const litCrit = body(25)
const litProblems = litCrit.problems ?? []
const litFix = (axis) => litProblems.find((p) => p.axis === axis)?.fix ?? ''
check('critique names the color axis on a planted hex',
  /axis: 'color'/.test(litFix('color')) && /per theme/.test(litFix('color')),
  litProblems.map((p) => `${p.axis}:${p.what}`).join(' | '))
check('critique names the typography axis on text-[Npx]',
  /axis: 'typography'/.test(litFix('typography')),
  litFix('typography').slice(0, 80))
check('critique names the radius axis on rounded-[Npx]',
  /cornerClass/.test(litFix('radius')),
  litFix('radius').slice(0, 80))
check('critique names the z-index axis on z-[N]',
  /axis: 'z-index'/.test(litFix('z-index')),
  litFix('z-index').slice(0, 80))
check('critique never says generic var(--token) for a typed literal',
  !litProblems.some((p) => /use var\(--token\)/.test(p.fix ?? '')),
  litProblems.map((p) => p.fix).join(' | '))

const shadcnDialog = body(26)
check('ds_contract ranks shadcn dialog for a shadcn dialog',
  (shadcnDialog.matches ?? [])[0]?.id === 'dialog',
  (shadcnDialog.matches ?? []).map((m) => `${m.id}@${m.home}`).join(', '))
check('shadcn dialog pin is merged (filename id, not Dialog)',
  typeof (shadcnDialog.matches ?? [])[0]?.doNot === 'string' && /21st\.dev/.test((shadcnDialog.matches ?? [])[0]?.doNot ?? ''),
  (shadcnDialog.matches ?? [])[0]?.doNot?.slice(0, 80))

const copyChip = body(27)
check('ds_contract ranks CopyChip for a copy chip',
  (copyChip.matches ?? [])[0]?.id === 'CopyChip',
  (copyChip.matches ?? []).map((m) => m.id).join(', '))
check('CopyChip pin names CHIP_TONES',
  /CHIP_TONES/.test((copyChip.matches ?? [])[0]?.doNot ?? ''),
  (copyChip.matches ?? [])[0]?.doNot?.slice(0, 80))

/*
 * The desk FRAME, both halves.
 *
 * `DeskPageChrome` is the one page header / tab row / detached-card frame, and
 * it only became findable when it moved into `src/design-system/components`
 * FLAT — the catalog walk is a non-recursive readdir, so the `desk/`
 * subdirectory it landed in first was law no agent could reach. `DeskPageLayout`
 * is the app-side adapter a page actually mounts, and it needs its own home
 * (`src/components/desk`) for the same reason `src/components/tables` needed
 * one: a pin that merges onto no catalog entry is invisible.
 *
 * Assert the RANK, not a count — this is the answer to "I need a page header",
 * and the failure mode is a plausible near-miss (a Panel, a StickyHeader) that
 * sends an agent off to hand-roll a title row.
 */
const deskChrome = body(28)
check('ds_contract ranks DeskPageChrome first for a page header',
  (deskChrome.matches ?? [])[0]?.id === 'DeskPageChrome',
  (deskChrome.matches ?? []).map((m) => m.id).join(', '))

// The rule REVERSED on 2026-08-31 (stations used to be forbidden this frame),
// so assert what it says now: stations mount it, and their tabs ride the top
// row rather than a TableStatusBar foot strip.
check('DeskPageChrome pin fences tabsLead off from the CTA slot',
  /tabsLead[\s\S]*not a second CTA/.test((deskChrome.matches ?? [])[0]?.doNot ?? ''),
  /tabsLead/.test((deskChrome.matches ?? [])[0]?.doNot ?? '') ? 'tabsLead law present' : 'MISSING')

check('DeskPageChrome pin puts station tabs on the top row',
  /scan stations mount it too/i.test((deskChrome.matches ?? [])[0]?.doNot ?? '')
    && /TableStatusBar/.test((deskChrome.matches ?? [])[0]?.doNot ?? ''),
  ((deskChrome.matches ?? [])[0]?.doNot ?? 'no pin').slice(0, 96))

const deskLayout = body(29)
check('ds_contract reaches DeskPageLayout for mounting the frame',
  (deskLayout.matches ?? [])[0]?.id === 'DeskPageLayout'
    && (deskLayout.matches ?? [])[0]?.import === '@/components/desk/DeskPageLayout',
  (deskLayout.matches ?? []).map((m) => `${m.id}@${m.home}`).slice(0, 3).join(', '))

/*
 * The foot strip's role NARROWED on 2026-08-31: page modes went to the frame's
 * top row and the desk-threaded `tabStrip` plumbing was deleted. Its pin is the
 * only thing standing between the next agent and re-wiring page tabs down here,
 * so assert the pin says so.
 */
const statusBar = body(31)
check('TableStatusBar pin keeps page modes off the foot strip',
  /DeskPageChrome's TOP row/.test((statusBar.matches ?? []).find((m) => m.id === 'TableStatusBar')?.doNot ?? ''),
  ((statusBar.matches ?? []).find((m) => m.id === 'TableStatusBar')?.doNot ?? 'no pin').slice(0, 88))

const labelFace = body(30)
check('ds_contract ranks LabelFacePreview for inline sticker edit',
  (labelFace.matches ?? [])[0]?.id === 'LabelFacePreview',
  (labelFace.matches ?? []).map((m) => `${m.id}@${m.home}`).join(', '))
check('LabelFacePreview pin names the slot overlay',
  /LabelFaceSlotOverlay/.test((labelFace.matches ?? [])[0]?.doNot ?? ''),
  ((labelFace.matches ?? [])[0]?.doNot ?? 'no pin').slice(0, 80))

const filterMenu = body(32)
const filterMenuHits = (filterMenu.matches ?? []).filter((m) => m.id === 'FilterMenu')
check('ds_contract reports exactly one FilterMenu (the ui SoT)',
  filterMenuHits.length === 1 && String(filterMenuHits[0]?.home ?? '').includes('ui composite'),
  filterMenuHits.map((m) => `${m.id}@${m.home}`).join(', ') || (filterMenu.matches ?? []).map((m) => m.id).join(', '))
check('FilterMenu pin forbids recreating the primitives fork',
  /primitives\/FilterMenu\.tsx/.test(filterMenuHits[0]?.doNot ?? ''),
  (filterMenuHits[0]?.doNot ?? 'no pin').slice(0, 80))

const filterBar = body(33)
const filterBarPin = (filterBar.matches ?? []).find((m) => m.id === 'FilterRefinementBar')
check('ds_contract pins FilterRefinementBar as a table-filter fork',
  Boolean(filterBarPin) && /DataTable/.test(filterBarPin?.doNot ?? ''),
  (filterBarPin?.doNot ?? 'no pin').slice(0, 96))
check('filter refinement intent still ranks DataTable',
  (filterBar.matches ?? []).some((m) => m.id === 'DataTable'),
  (filterBar.matches ?? []).map((m) => m.id).join(', '))

/*
 * Operator 2026-08-31: dumb / gun stations must resolve to StationComposerHost
 * (full mouth), not raw OmnichannelComposerDock. Pin must forbid showModeRow={false}.
 */
const dumbMouth = body(34)
check('ds_contract ranks StationComposerHost for dumb station mouth',
  (dumbMouth.matches ?? [])[0]?.id === 'StationComposerHost',
  (dumbMouth.matches ?? []).map((m) => m.id).join(', '))
check('StationComposerHost pin forbids deleting the mode row on dumb stations',
  /showModeFaces=\{false\}/.test((dumbMouth.matches ?? [])[0]?.doNot ?? '')
    && /showModeRow=\{false\}/.test((dumbMouth.matches ?? [])[0]?.doNot ?? ''),
  ((dumbMouth.matches ?? [])[0]?.doNot ?? 'no pin').slice(0, 120))

const overlayCrit = body(35)
check('cohort workspace: visibility/zIndex.panel styles are not inline-style drifts',
  !(overlayCrit.problems ?? []).some((p) => /inline style object/.test(p.what ?? '')),
  (overlayCrit.problems ?? []).map((p) => p.what).join(' | ') || 'none')

const badStyleCrit = body(36)
check('non-cohort style={{ color }} still flags as inline-style drift',
  (badStyleCrit.problems ?? []).some((p) => /inline style object/.test(p.what ?? '')),
  (badStyleCrit.problems ?? []).map((p) => p.what).join(' | '))

{
  const pinned = readFileSync(path.join(REPO, 'src/design-system/pinned.json'), 'utf8')
  check('pinned.json declares ScanStationOverlayShell cohort law',
    /"ScanStationOverlayShell"/.test(pinned) && /SCAN_STATION_OVERLAY_COHORT/.test(pinned),
    'missing ScanStationOverlayShell pin')
}

console.log(fails === 0 ? '\nsmoke: all good' : `\nsmoke: ${fails} failed`)
process.exit(fails === 0 ? 0 : 1)
