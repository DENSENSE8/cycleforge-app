/**
 * Port contract: a hand-rolled control is PORTED onto the design system, not deleted.
 *
 * Deleting a forked component turns every anchor green and loses the job it did (run
 * loop_2026-10-04T00-35-25: 11 → 0 by deleting the bottom bar, "Scan item" gone). So every action
 * verb inside a raw <button> of a file the loop is asked to fix is a contract: afterwards the same
 * visible text must still render — as JSX text or a string literal, never a comment (run
 * loop_2026-10-04T00-44-22 pasted the text into a JSDoc comment) — from a file that imports the
 * design system, and never again inside a raw <button>. Links that are doors (an href the route
 * tree owns) are exempt: list pages show records only, so a door may be removed.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DS_IMPORT = /from ['"]@\/(design-system|components\/ui)\//;

/** Raw <button> elements → their inner JSX. Brace- and quote-aware, so `onClick={() => …}` does not end the tag. */
export function rawButtons(source) {
  const out = [];
  let at = 0;
  while ((at = source.indexOf('<button', at)) >= 0) {
    if (!/[\s>]/.test(source[at + 7] ?? '')) {
      at += 7;
      continue;
    }
    let i = at + 7;
    let depth = 0;
    let quote = null;
    for (; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (c === quote && source[i - 1] !== '\\') quote = null;
      } else if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    const close = source.indexOf('</button>', i);
    if (close < 0) break;
    out.push(source.slice(i + 1, close));
    at = close + 9;
  }
  return out;
}

/** Visible text of a JSX fragment: elements and every (nested) `{…}` expression removed. */
export function textOf(jsx) {
  let out = '';
  let depth = 0;
  for (const c of jsx.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')) {
    if (c === '{') depth++;
    else if (c === '}') depth = Math.max(0, depth - 1);
    else if (depth === 0) out += c;
  }
  return out.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** A verb is words an operator reads, not leftover code (`) : (`, `keys= />`). */
const VERB = /^[\p{L}\p{N}][\p{L}\p{N} .,'’&+:\-/#…!?]*$/u;

export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

export function rendersText(source, text) {
  const esc = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(['"\`])${esc}\\1|>\\s*${esc}\\s*<`).test(stripComments(source));
}

/** Action verbs (raw <button> texts) in the given files of `repo`. */
export function portContract(repo, files) {
  const verbs = [];
  for (const file of new Set(files)) {
    const p = path.join(repo, file);
    if (!file.endsWith('.tsx') || !fs.existsSync(p)) continue;
    for (const inner of rawButtons(fs.readFileSync(p, 'utf8'))) {
      const text = textOf(inner);
      if (text && text.length <= 60 && VERB.test(text)) verbs.push({ text, file });
    }
  }
  return verbs;
}

/** Port findings for `contract` in `repo` (a git checkout): every verb must render from a DS-importing file, outside a raw <button>. */
export function portFindings(repo, contract) {
  if (!contract.length) return [];
  const git = (...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' }).stdout ?? '';
  const root = git('rev-list', '--max-parents=0', 'HEAD').trim();
  const touched = [...git('diff', '--name-only', root).split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')];
  const files = [...new Set([...contract.map((v) => v.file), ...touched])].filter((f) => f.endsWith('.tsx') && fs.existsSync(path.join(repo, f)));
  const sources = files.map((f) => ({ file: f, text: fs.readFileSync(path.join(repo, f), 'utf8') }));
  const out = [];
  for (const v of contract) {
    const homes = sources.filter((s) => rendersText(s.text, v.text));
    const rawStill = homes.some((s) => rawButtons(stripComments(s.text)).some((inner) => textOf(inner) === v.text));
    const ported = homes.some((s) => DS_IMPORT.test(s.text));
    const finding = (rule, message) => ({ anchor: 'port', key: `port|${rule}|${v.file}|${v.text}`, severity: 'error', rule, file: v.file, message });
    if (!homes.length) out.push(finding('verb-dropped', `"${v.text}" was removed instead of ported onto a design-system primitive — keep the job, change the control`));
    else if (rawStill || !ported) out.push(finding('not-ported', `"${v.text}" still renders from a hand-rolled control — render it through the existing primitive (import from @/design-system/…)`));
  }
  return out;
}
