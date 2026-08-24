/**
 * Omni-Command Composer document model.
 *
 * The composer is a sequence of text runs and entity chips — a standard
 * <input> cannot hold chips, so Lexical nodes map 1:1 onto these types.
 */

export type ComposerEntityType = 'order' | 'user' | 'action';

export interface ComposerTextNode {
  readonly type: 'text';
  readonly text: string;
}

export interface ComposerEntityChip {
  readonly type: 'entity_chip';
  readonly entityType: ComposerEntityType;
  readonly id: string | number;
  readonly label: string;
  readonly platform?: string | null;
  readonly payload: unknown;
}

export type ComposerNode = ComposerTextNode | ComposerEntityChip;

export function isEntityChip(node: ComposerNode): node is ComposerEntityChip {
  return node.type === 'entity_chip';
}

/** Flatten a document to sendable plain text (chip → its label). */
export function serializeComposerNodes(nodes: readonly ComposerNode[]): string {
  return nodes
    .map((n) => (n.type === 'text' ? n.text : n.label))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
