'use client';

/**
 * The committed identifier, as a Lexical inline DecoratorNode. A chip holds
 * the RESOLVED row (pk + human id + platform + title), never just the text —
 * commit already hydrated the feed and the orders tile, and the chip is the
 * composer-side receipt of that. `getTextContent` answers the human id so
 * prose serialization and trailing-token math stay honest.
 */

import type { JSX } from 'react';
import {
  $applyNodeReplacement,
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';

export interface EntityChipPayload {
  readonly entity: 'order';
  /** Numeric pk of the resolved row. */
  readonly pk: number;
  /** The human identifier the chip displays (order #). */
  readonly token: string;
  /** Platform label from the order-platform SoT ('ebay', 'Amazon', '' …). */
  readonly platform: string;
  readonly title: string | null;
}

export type SerializedEntityChipNode = Spread<EntityChipPayload, SerializedLexicalNode>;

function ChipView({ payload }: { payload: EntityChipPayload }) {
  return (
    <span
      className="occ-chip"
      data-entity={payload.entity}
      data-order-id={payload.token}
      data-pk={payload.pk}
      title={payload.title ?? payload.token}
    >
      {payload.platform ? <span className="occ-chip-platform">{payload.platform}</span> : null}
      <span className="occ-chip-id">{payload.token}</span>
    </span>
  );
}

export class EntityChipNode extends DecoratorNode<JSX.Element> {
  __payload: EntityChipPayload;

  static getType(): string {
    return 'entity-chip';
  }

  static clone(node: EntityChipNode): EntityChipNode {
    return new EntityChipNode(node.__payload, node.__key);
  }

  // The base signature is wide (any node's serialized JSON), so the payload
  // is narrowed at runtime rather than by assertion.
  static importJSON(json: SerializedLexicalNode & Record<string, unknown>): EntityChipNode {
    return $createEntityChipNode({
      entity: 'order',
      pk: typeof json.pk === 'number' ? json.pk : 0,
      token: typeof json.token === 'string' ? json.token : '',
      platform: typeof json.platform === 'string' ? json.platform : '',
      title: typeof json.title === 'string' ? json.title : null,
    });
  }

  constructor(payload: EntityChipPayload, key?: NodeKey) {
    super(key);
    this.__payload = payload;
  }

  exportJSON(): SerializedEntityChipNode {
    return { ...super.exportJSON(), ...this.__payload };
  }

  createDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'occ-chip-host';
    return el;
  }

  updateDOM(): boolean {
    return false;
  }

  isInline(): boolean {
    return true;
  }

  getTextContent(): string {
    return this.__payload.token;
  }

  getPayload(): EntityChipPayload {
    return this.getLatest().__payload;
  }

  decorate(): JSX.Element {
    return <ChipView payload={this.__payload} />;
  }
}

export function $createEntityChipNode(payload: EntityChipPayload): EntityChipNode {
  return $applyNodeReplacement(new EntityChipNode(payload));
}

export function $isEntityChipNode(
  node: LexicalNode | null | undefined,
): node is EntityChipNode {
  return node instanceof EntityChipNode;
}
