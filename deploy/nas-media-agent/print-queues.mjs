/**
 * Pure queue mapping for pack PDF print.
 *
 * PRINT_QUEUE_LABEL — 4×6 USB thermal (shipping_label)
 * PRINT_QUEUE_PAPER — letter laser (packing_slip + manuals)
 *
 * If only one env is set, every document type uses that queue (Canon-only smoke).
 */

/**
 * @param {string | null | undefined} documentType
 * @param {{ label?: string | null; paper?: string | null }} queues
 * @returns {string | null}
 */
export function resolvePrintQueue(documentType, queues = {}) {
  const label = String(queues.label || '').trim() || null;
  const paper = String(queues.paper || '').trim() || null;
  const only = label && !paper ? label : paper && !label ? paper : null;
  if (only) return only;
  if (!label && !paper) return null;

  const type = String(documentType || '').trim();
  if (type === 'shipping_label') return label;
  return paper;
}

/**
 * @param {{ label?: string | null; paper?: string | null }} queues
 * @returns {string[]}
 */
export function configuredQueueAllowlist(queues = {}) {
  const out = [];
  const label = String(queues.label || '').trim();
  const paper = String(queues.paper || '').trim();
  if (label) out.push(label);
  if (paper && paper !== label) out.push(paper);
  return out;
}
