/** The DEVICE a repair-service listing title is about — the title with the sales boilerplate cut out. */

const REPAIR_SERVICE_PHRASE = /\brepair\s+service\b(?:\s+for\b)?/i;

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function repairDeviceName(title: string | null | undefined): string {
  const raw = collapse(title ?? '');
  const match = REPAIR_SERVICE_PHRASE.exec(raw);
  if (!match) return raw;

  const before = collapse(raw.slice(0, match.index));
  const after = collapse(raw.slice(match.index + match[0].length));
  if (!before || !after) return before || after || raw;

  const lastBefore = before.slice(before.lastIndexOf(' ') + 1);
  const [firstAfter = ''] = after.split(' ', 1);
  if (lastBefore.toLowerCase() === firstAfter.toLowerCase()) {
    return collapse(`${before} ${after.slice(firstAfter.length)}`);
  }
  return `${before} ${after}`;
}
