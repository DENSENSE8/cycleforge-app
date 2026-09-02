#!/usr/bin/env node
/**
 * design-mcp — Cycle Forge entry point (FABLE-5.1 gap report §G.2).
 *
 * The ENGINE now lives in Garisek-OS (`tools/design-mcp/target-engine.mjs`,
 * served by `project-server.mjs`); this file is the shim that aims it at this
 * checkout so `ds.mjs`, `run-mcp.sh`, `smoke.mjs`, the Cursor session hooks
 * and any client still spawning this path keep working unchanged.
 *
 * The LAW stays here: `src/design-system/pinned.json`, the four cohort
 * modules, `tools/design-mcp/router.json` (generated), and
 * `tools/design-mcp/design-mcp.profile.json` (primitive homes, token sources,
 * cohort workspaces, adjudicator adoption). The engine reads them by path and
 * never owns them.
 *
 *   DESIGN_MCP_REPO      — tree to describe (defaults to this checkout)
 *   GARISEK_OS_ROOT      — where the engine lives
 *
 * stdout carries JSON-RPC only; every diagnostic goes to stderr.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = process.env.DESIGN_MCP_REPO ? path.resolve(process.env.DESIGN_MCP_REPO) : path.resolve(HERE, '..', '..')
const GARISEK = process.env.GARISEK_OS_ROOT || '/home/michaelgarisek/Projects/Garisek-OS'
const ENGINE_SERVER = path.join(GARISEK, 'tools', 'design-mcp', 'server.mjs')

if (!existsSync(ENGINE_SERVER)) {
  process.stderr.write(`cycleforge-design-mcp: engine missing at ${ENGINE_SERVER} (set GARISEK_OS_ROOT) — refusing to serve an empty catalog.\n`)
  process.exit(75)
}

process.env.DESIGN_MCP_PROJECT = process.env.DESIGN_MCP_PROJECT || 'cycleforge-app'
process.env.DESIGN_MCP_REPO = REPO
await import(pathToFileURL(ENGINE_SERVER).href)
