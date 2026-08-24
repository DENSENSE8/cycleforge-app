'use client';

/**
 * Inline entity chip — a Lexical decorator node. The hidden payload is the
 * full lookup object; the visible face is platform + id.
 */

import type { JSX } from 'react';
import {
  DecoratorNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import type { ComposerEntityChip } from '@/lib/composer/document';

export type SerializedEntityChipNode = Spread<
  { chip: ComposerEntityChip },
  SerializedLexicalNode
>;

export class EntityChipNode extends DecoratorNode<JSX.Element> {
  __chip: ComposerEntityChip;

  static getType(): string {
    return 'entity-chip';
  }

  static clone(node: EntityChipNode): EntityChipNode {
    return new EntityChipNode(node.__chip, node.__key);
  }

  constructor(chip: ComposerEntityChip, key?: NodeKey) {
    super(key);
    this.__chip = chip;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement('span');
    span.className = 'occ-chip-host';
    span.setAttribute('data-entity-type', this.__chip.entityType);
    return span;
  }

  updateDOM(): false {
    return false;
  }

  exportJSON(): SerializedEntityChipNode {
    return { ...super.exportJSON(), chip: this.__chip };
  }

  static importJSON(serialized: SerializedEntityChipNode): EntityChipNode {
    return $createEntityChipNode(serialized.chip);
  }

  getChip(): ComposerEntityChip {
    return this.__chip;
  }

  getTextContent(): string {
    return this.__chip.label;
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  decorate(): JSX.Element {
    return <EntityChipView chip={this.__chip} />;
  }
}

export function $createEntityChipNode(chip: ComposerEntityChip): EntityChipNode {
  return new EntityChipNode(chip);
}

export function $isEntityChipNode(node: LexicalNode | null | undefined): node is EntityChipNode {
  return node instanceof EntityChipNode;
}

function EntityChipView({ chip }: { chip: ComposerEntityChip }) {
  const title =
    chip.platform && chip.entityType === 'order'
      ? `${chip.platform} · ${chip.label}`
      : chip.label;
  return (
    <span className="occ-chip" data-entity-type={chip.entityType} title={title}>
      {chip.platform ? <span className="occ-chip-platform">{chip.platform}</span> : null}
      <span className="occ-chip-label">{chip.label}</span>
    </span>
  );
}
