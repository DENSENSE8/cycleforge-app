#!/usr/bin/env node
/**
 * Host CLI for the prompt router (TS SoT: src/lib/eval/prompt-router.ts).
 *
 *   node --import tsx tools/eval-ledger/route.mjs --json "sort the image column"
 *   node --import tsx tools/eval-ledger/route.mjs --dirty-paths '["src/design-system/primitives/KeyboardKey.tsx"]'
 *   printf '%s' '["src/..."]' | node --import tsx tools/eval-ledger/route.mjs --dirty-paths
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  emitRouterDocument,
  routeDirtyPaths,
  routePrompt,
  serializeRefuse,
  serializeRoute,
} from '../../src/lib/eval/prompt-router.ts'

function usage(code = 1) {
  console.error(
    'usage: node --import tsx tools/eval-ledger/route.mjs --json <text> | --dirty-paths [json-array] | --emit-json [out]',
  )
  process.exit(code)
}

const argv = process.argv.slice(2)
if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') usage(argv.length === 0 ? 1 : 0)

if (argv[0] === '--json') {
  const text = argv.slice(1).join(' ').trim()
  if (!text) usage()
  const result = routePrompt(text)
  console.log(
    JSON.stringify(
      {
        routes: result.routes.map(serializeRoute),
        refusals: result.refusals.map(serializeRefuse),
        unrouted: result.unrouted,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

if (argv[0] === '--emit-json') {
  const doc = emitRouterDocument()
  const text = `${JSON.stringify(doc, null, 2)}\n`
  const out = argv[1] && !argv[1].startsWith('-') ? argv[1] : join(process.cwd(), 'tools/design-mcp/router.json')
  writeFileSync(out, text)
  console.log(out)
  process.exit(0)
}

if (argv[0] === '--dirty-paths') {
  let raw = argv[1]
  if (!raw || raw.startsWith('-')) {
    raw = readFileSync(0, 'utf8')
  }
  let paths
  try {
    paths = JSON.parse(raw)
  } catch {
    console.error('route.mjs: --dirty-paths expects a JSON array of repo-relative paths')
    process.exit(2)
  }
  if (!Array.isArray(paths) || paths.some((p) => typeof p !== 'string')) {
    console.error('route.mjs: --dirty-paths expects a JSON array of strings')
    process.exit(2)
  }
  console.log(JSON.stringify(routeDirtyPaths(paths)))
  process.exit(0)
}

usage()
