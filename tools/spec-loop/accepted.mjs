/**
 * Accepted rule modules (Garisek-OS docs/loops/AUTORESEARCH.md §1.3a): operator rejections the kernel
 * drafted into a probe, machine-checked, and the operator accepted (`cli queue decide --outcome accepted`).
 * Each lives in `rules/accepted/<ruleId>/{rule.mjs,ruling.json,baseline.json,evidence/}`; the kernel's
 * `loadAcceptedRules` turns them into SpecRuleV1s (probe ratcheted by baseline.json) plus one
 * `<ruleId>--plant` mutant each. contracts.mjs / mutants.mjs spread them into CONTRACTS / MUTANTS.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GARISEK_OS = process.env.GARISEK_OS_ROOT || path.join(os.homedir(), 'Projects/Garisek-OS');

/** Repo-relative install dir (pack `proposals.acceptedDir`). */
export const ACCEPTED_DIR = 'tools/spec-loop/rules/accepted';
/** The anchor that runs CONTRACTS' static probes (anchors.mjs `contracts`) — accepted rules' violations land there. */
export const ACCEPTED_ANCHOR = 'contracts';

/** Installed rule dirs, sorted (a dir without its files is the kernel loader's error to raise, not ours to hide). */
export function acceptedRuleIds(root = PACK_ROOT) {
  const dir = path.join(root, ACCEPTED_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

/** Nothing installed → no kernel import at all; something installed → the kernel loader must exist (a missing one throws). */
export const ACCEPTED =
  acceptedRuleIds().length === 0
    ? { rules: [], mutants: [] }
    : await (
        await import(pathToFileURL(path.join(GARISEK_OS, 'scripts/spec-kernel/accepted.ts')).href)
      ).loadAcceptedRules({ root: PACK_ROOT, dir: ACCEPTED_DIR, anchor: ACCEPTED_ANCHOR });
