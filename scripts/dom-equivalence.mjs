#!/usr/bin/env node
// DOM equivalence — proof that a refactor changed no markup, for the RecordCard ports.
//
//   node scripts/dom-equivalence.mjs capture <name> <route> <cardTestId>
//   node scripts/dom-equivalence.mjs compare <before> <after>
//
// `capture` loads <route> at :3050 (AGENTS.md §1) with the saved admin session
// (tests/.auth/admin.json), waits for [data-testid=<cardTestId>], and writes
// /tmp/dom-eq-<name>.json: every card as [tag, sorted attributes (class tokens
// sorted; id/style/radix/motion attributes dropped), children] with adjacent
// text merged. `compare` prints SAME, or the first differing paths.
//
// Take the "before" capture on the untouched page, change code, capture "after",
// compare. Live data moves between runs (counts, stamps): a diff whose only
// change is text is data, not markup — read the printed paths before trusting it.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [mode, a, b, c] = process.argv.slice(2);
const file = (name) => `/tmp/dom-eq-${name}.json`;

if (mode === 'capture') {
  const [name, route, testId] = [a, b, c];
  if (!name || !route || !testId) throw new Error('capture <name> <route> <cardTestId>');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    storageState: 'tests/.auth/admin.json',
    baseURL: 'http://localhost:3050',
    viewport: { width: 1500, height: 1100 },
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector(`[data-testid="${testId}"]`, { timeout: 90000 });
  await page.waitForTimeout(2500);
  const cards = await page.evaluate((id) => {
    const DROP = /^(id|style|aria-controls|aria-describedby|aria-labelledby|data-radix.*|data-motion.*|data-projection-id|tabindex)$/;
    const walk = (el) => {
      if (el.nodeType !== 1) return null;
      const attrs = [...el.attributes]
        .filter((attr) => !DROP.test(attr.name))
        .map((attr) => `${attr.name}=${attr.name === 'class' ? attr.value.split(/\s+/).filter(Boolean).sort().join(' ') : attr.value}`)
        .sort();
      const kids = [];
      let text = '';
      for (const node of el.childNodes) {
        if (node.nodeType === 3) text += node.textContent;
        else {
          if (text.trim()) kids.push(text.replace(/\s+/g, ' ').trim());
          text = '';
          const child = walk(node);
          if (child) kids.push(child);
        }
      }
      if (text.trim()) kids.push(text.replace(/\s+/g, ' ').trim());
      return [el.tagName.toLowerCase(), attrs, kids];
    };
    return [...document.querySelectorAll(`[data-testid="${id}"]`)].map(walk);
  }, testId);
  await browser.close();
  fs.writeFileSync(file(name), JSON.stringify({ route, testId, cards }));
  console.log(`captured ${cards.length} cards → ${file(name)}`);
} else if (mode === 'compare') {
  const before = JSON.parse(fs.readFileSync(file(a), 'utf8'));
  const after = JSON.parse(fs.readFileSync(file(b), 'utf8'));
  const diffs = [];
  const walk = (x, y, path) => {
    if (diffs.length >= 20) return;
    if (typeof x !== typeof y || Array.isArray(x) !== Array.isArray(y)) return void diffs.push([path, x, y]);
    if (Array.isArray(x)) {
      if (x.length !== y.length) diffs.push([`${path} length`, x.length, y.length]);
      x.forEach((item, i) => i < y.length && walk(item, y[i], `${path}/${i}`));
    } else if (x !== y) diffs.push([path, x, y]);
  };
  walk(before.cards, after.cards, '');
  if (!diffs.length) console.log(`SAME (${before.cards.length} cards)`);
  else for (const [path, x, y] of diffs) console.log(`DIFF ${path}\n  before: ${JSON.stringify(x)}\n  after:  ${JSON.stringify(y)}`);
} else {
  console.log('usage: capture <name> <route> <cardTestId> | compare <before> <after>');
}
