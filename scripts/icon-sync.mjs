#!/usr/bin/env node
/**
 * Icon sync — derives EVERY brand asset from the single master file.
 *
 *   public/brand/icon.master.svg   <- edit this (variant groups #cf-*)
 *   pnpm icon:sync                 -> regenerates all targets below
 *   pnpm icon:check                -> fails if committed targets drift from master
 *
 * Targets:
 *   public/icon.svg                 favicon variant (vector)
 *   public/favicon.png        64    favicon variant
 *   public/icon-192.png       192   full variant (PWA "any")
 *   public/icon-512.png       512   full-square variant (PWA maskable)
 *   public/apple-touch-icon.png 180 full-square variant (iOS rounds it)
 *   build/icon.png           1024   full-square variant (electron-builder)
 *   public/brand/loading-mark.svg  loading variant (BootSplash CSS strike)
 *   public/brand/mark.svg            mono variant (letterhead)
 *   public/brand/hero-carbon.svg     material hero (marketing/app-store)
 *   public/brand/lockup-horizontal.svg  full variant + wordmark (template below)
 *
 * Rasterization: rsvg-convert (deterministic for a given input + toolchain).
 * The master is hand-editable in any vector tool (Figma: File > Place image /
 * paste SVG) — sync re-derives PNGs, so no exported file is ever edited alone.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = join(repoRoot, 'public/brand/icon.master.svg');
const checkOnly = process.argv.includes('--check');

/** Extract a balanced <g id="…">…</g> block from the master (controlled input). */
function extractGroup(id) {
  const src = readFileSync(MASTER, 'utf8');
  const open = `<g id="${id}">`;
  const start = src.indexOf(open);
  if (start === -1) throw new Error(`master has no variant group ${id}`);
  let i = start + open.length;
  let depth = 1;
  while (depth > 0 && i < src.length) {
    const nextOpen = src.indexOf('<g', i);
    const nextClose = src.indexOf('</g>', i);
    if (nextClose === -1) throw new Error(`unbalanced group ${id}`);
    if (nextOpen !== -1 && nextOpen < nextClose) { depth++; i = nextOpen + 2; }
    else { depth--; i = nextClose + 4; }
  }
  return src.slice(start, i);
}

const svgDoc = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${inner}</svg>`;

const LOCKUP = (fullGroup) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1520 512">${fullGroup}` +
  `<text x="600" y="328" fill="#0f172a" ` +
  `font-size="176" font-weight="600" letter-spacing="-2" font-family="'IBM Plex Mono', ui-monospace, monospace">Cycle Forge</text></svg>`;

// variant -> [ [relativeTarget, kind, size] ... ]
const TARGETS = [
  ['cf-favicon', [
    ['public/icon.svg', 'svg'],
    ['public/favicon.png', 'png', 64],
  ]],
  ['cf-full', [
    ['public/icon-192.png', 'png', 192],
  ]],
  ['cf-full-square', [
    ['public/icon-512.png', 'png', 512],
    ['public/apple-touch-icon.png', 'png', 180],
    ['build/icon.png', 'png', 1024],
  ]],
  ['cf-loading', [
    ['public/brand/loading-mark.svg', 'svg'],
  ]],
  ['cf-mono', [
    ['public/brand/mark.svg', 'svg'],
  ]],
  ['cf-material', [
    ['public/brand/hero-carbon.svg', 'svg'],
  ]],
];

const tmp = mkdtempSync(join(tmpdir(), 'cf-icon-'));
const written = [];
const drifted = [];

try {
  for (const [variant, targets] of TARGETS) {
    const group = extractGroup(variant);
    for (const [rel, kind, size] of targets) {
      let bytes;
      if (kind === 'svg') {
        bytes = Buffer.from(svgDoc(group), 'utf8');
      } else {
        const tmpSvg = join(tmp, `${variant}.svg`);
        writeFileSync(tmpSvg, svgDoc(group));
        bytes = execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), tmpSvg]);
      }
      const dest = join(repoRoot, rel);
      let existing = null;
      try { existing = readFileSync(dest); } catch { /* new target */ }
      if (existing && Buffer.compare(existing, bytes) === 0) continue; // in sync
      if (checkOnly) { drifted.push(rel); continue; }
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, bytes);
      written.push(rel);
    }
  }
  // lockup (composition: full variant + wordmark)
  {
    const bytes = Buffer.from(LOCKUP(extractGroup('cf-full')), 'utf8');
    const dest = join(repoRoot, 'public/brand/lockup-horizontal.svg');
    if (Buffer.compare(readFileSync(dest), bytes) !== 0) {
      if (checkOnly) drifted.push('public/brand/lockup-horizontal.svg');
      else { writeFileSync(dest, bytes); written.push('public/brand/lockup-horizontal.svg'); }
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (checkOnly) {
  if (drifted.length) {
    console.error('✗ icon:check — committed assets drift from icon.master.svg:');
    for (const d of drifted) console.error(`    ${d}`);
    console.error('  Run `pnpm icon:sync` and commit the result.');
    process.exit(1);
  }
  console.log('✓ icon:check — all brand assets match icon.master.svg');
} else {
  console.log(written.length
    ? `✓ icon:sync — updated ${written.length} file(s):\n    ${written.join('\n    ')}`
    : '✓ icon:sync — everything already matches the master (no changes)');
}
