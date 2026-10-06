/**
 * patchLabelFaceDocument — text-slot in-place updates for LabelFacePreview.
 * Run: npx tsx --test src/lib/print/labelFace.patch.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { patchLabelFaceDocument, type LabelFaceModel } from './labelFace';

type StubNode = {
  textContent: string | null;
  className: string;
  children: StubNode[];
  remove(): void;
  appendChild(node: StubNode): StubNode;
};

function stubNode(initial = ''): StubNode {
  const node: StubNode = {
    textContent: initial,
    className: '',
    children: [],
    remove() {
      node.textContent = null;
      node.className = '__removed__';
    },
    appendChild(child) {
      node.children.push(child);
      return child;
    },
  };
  return node;
}

function makeDoc(slots: Record<string, StubNode>) {
  return {
    querySelector(sel: string) {
      return slots[sel] ?? null;
    },
    createElement(_tag: string) {
      return stubNode();
    },
  };
}

const baseModel = (): LabelFaceModel => ({
  topLeft: 'Goodwill',
  topRight: '8/4/26',
  center: 'Parts 64118',
  bottomLeft: 'A',
  bottomRight: 'PO 8',
  matrix: { value: 'R-1', symbology: 'gs1datamatrix' },
  hri: 'R-1',
});

test('patchLabelFaceDocument updates receiving center without touching other slots', () => {
  const center = stubNode('Parts 64118');
  const tl = stubNode('Goodwill');
  const doc = makeDoc({
    '.center': center,
    '.tl': tl,
    '.tr': stubNode('8/4/26'),
    '.bl': stubNode('A'),
    '.br': stubNode('PO 8'),
    '.hri': stubNode('R-1'),
  });

  patchLabelFaceDocument(doc, {
    ...baseModel(),
    center: 'klasdjkfasdf',
  });

  assert.equal(center.textContent, 'klasdjkfasdf');
  assert.equal(tl.textContent, 'Goodwill');
});

test('patchLabelFaceDocument updates product title and custom line slots', () => {
  const ptitle = stubNode('Old title');
  const center = stubNode('');
  const doc = makeDoc({
    '.ptitle': ptitle,
    '.center': center,
    '.bl': stubNode('A'),
    '.br': stubNode('Black'),
  });

  patchLabelFaceDocument(doc, {
    kind: 'product',
    topLeft: 'New title',
    topRight: '',
    center: 'Includes remote',
    bottomLeft: 'A',
    bottomRight: 'Black',
    matrix: { value: 'SKU', symbology: 'datamatrix' },
  });

  assert.equal(ptitle.textContent, 'New title');
  assert.equal(center.textContent, 'Includes remote');
});

test('patchLabelFaceDocument updates the location code slot', () => {
  const lcode = stubNode('C-01-01-1');
  const doc = makeDoc({
    '.lcode': lcode,
    '.hri': stubNode('C-01-01-1'),
  });

  patchLabelFaceDocument(doc, {
    kind: 'location',
    topLeft: '',
    topRight: '',
    center: 'C-01-01-1-01',
    bottomLeft: '',
    bottomRight: '',
    matrix: { value: 'loc', symbology: 'gs1datamatrix' },
    hri: 'C-01-01-1-01',
  });

  assert.equal(lcode.textContent, 'C-01-01-1-01');
});

test('patchLabelFaceDocument creates HRI when it appears', () => {
  const qrcol = stubNode();
  const doc = makeDoc({ '.qrcol': qrcol });

  patchLabelFaceDocument(doc, {
    ...baseModel(),
    hri: 'R-99',
  });

  assert.equal(qrcol.children.length, 1);
  assert.equal(qrcol.children[0]?.className, 'hri');
  assert.equal(qrcol.children[0]?.textContent, 'R-99');
});
