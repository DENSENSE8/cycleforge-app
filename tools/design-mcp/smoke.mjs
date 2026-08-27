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
import { rmSync, symlinkSync } from 'node:fs'
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
send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'ds_critique', arguments: { file_path: 'src/shell/AssistantFeed.tsx' } } })
send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'ds_critique', arguments: { file_path: '../Garisek-OS/package.json' } } })
send({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'ds_critique', arguments: { file_path: 'src/design-system/primitives/Button.tsx' } } })
send({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'ds_critique', arguments: { file_path: LINK_REL } } })

await new Promise((r) => setTimeout(r, 6000))
child.kill()

const msgs = out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return { RAW: l.slice(0, 120) } } })
let fails = 0
const check = (label, ok, detail) => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) fails++ }
const byId = (id) => msgs.find((m) => m.id === id)
const body = (id) => JSON.parse(byId(id)?.result?.content?.[0]?.text ?? '{}')

check('every stdout line is valid JSON-RPC', !msgs.some((m) => m.RAW), msgs.find((m) => m.RAW)?.RAW)
check('initialize', !!byId(1)?.result?.serverInfo, byId(1)?.result?.serverInfo?.name)
check('tools/list returns 3 tools', byId(2)?.result?.tools?.length === 3, (byId(2)?.result?.tools ?? []).map((t) => t.name).join(', '))

const contract = body(3)
check('ds_contract finds primitives', (contract.matches ?? []).length > 0, `${contract.catalog_size} in catalog`)

// Exact counts, because this extractor has already been wrong twice: it read
// the IMPORT of BUTTON_VARIANTS instead of its declaration (0 variants), and
// it understood only the cva shape (missing the flat map entirely).
const dsButton = (contract.matches ?? []).find((m) => m.id === 'Button')
check('flat variant map read exactly (9)', (dsButton?.variant_axes?.variant ?? []).length === 9,
  (dsButton?.variant_axes?.variant ?? []).join('|'))
const uiButton = (contract.matches ?? []).find((m) => m.id === 'button')
check('cva variant map still read (6 variants, 4 sizes)',
  (uiButton?.variant_axes?.variant ?? []).length === 6 && (uiButton?.variant_axes?.size ?? []).length === 4,
  `${(uiButton?.variant_axes?.variant ?? []).length}v / ${(uiButton?.variant_axes?.size ?? []).length}s`)
check('both primitive homes are reported', new Set((contract.matches ?? []).map((m) => m.home)).size > 1,
  [...new Set((contract.matches ?? []).map((m) => m.home))].join(' + '))

const tokens = body(4)
check('ds_tokens returns the radius axis', (tokens.tokens ?? []).length > 0, `${tokens.count} tokens`)

const crit = body(5)
check('ds_critique finds a real fork in AssistantFeed',
  (crit.problems ?? []).some((p) => p.severity === 'forks-the-system'),
  (crit.problems ?? []).map((p) => p.severity).join(', '))

check('ds_critique refuses to read outside the repo', byId(6)?.result?.isError === true,
  byId(6)?.result?.content?.[0]?.text?.slice(0, 55))
check('ds_critique refuses a symlink that leaves the repo', byId(8)?.result?.isError === true,
  byId(8)?.result?.content?.[0]?.text?.slice(0, 55))

const prim = body(7)
check('fork detection is OFF where primitives are defined',
  !(prim.problems ?? []).some((p) => p.severity === 'forks-the-system'),
  `${(prim.problems ?? []).length} problems, none forks`)

console.log(fails === 0 ? '\nsmoke: all good' : `\nsmoke: ${fails} failed`)
process.exit(fails === 0 ? 0 : 1)
