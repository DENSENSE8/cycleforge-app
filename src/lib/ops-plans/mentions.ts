/**
 * Inline @staff tokens for the Home Tasks composer.
 *
 * Ticket mode uses `@` for Cc on a different mouth — this parser is only for
 * the Staff face on the desk Ask lane. Tokens are the first name / handle after
 * `@`; resolution is prefix-then-first-token against live org staff names.
 */

export function mentionTokens(text: string): string[] {
  const out: string[] = [];
  const re = /@([A-Za-z][A-Za-z0-9._-]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const token = match[1];
    if (token && !out.includes(token)) out.push(token);
  }
  return out;
}

export function resolveMentions<T extends { id: number; name: string }>(
  tokens: readonly string[],
  staff: readonly T[],
): T[] {
  const hits: T[] = [];
  for (const token of tokens) {
    const needle = token.toLowerCase();
    const hit = staff.find((row) => {
      const name = row.name.trim().toLowerCase();
      if (!name) return false;
      if (name === needle || name.startsWith(needle)) return true;
      const first = name.split(/\s+/)[0] ?? '';
      return first === needle || first.startsWith(needle);
    });
    if (hit && !hits.some((row) => row.id === hit.id)) hits.push(hit);
  }
  return hits;
}
