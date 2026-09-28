/**
 * Shipping › Labels & docs — one view per print job: `label-intake.labels`
 * (4×6 labels not yet printed), `label-intake.paperwork` (packing slips and
 * manuals not yet printed) and `label-intake.printed` (the print history of
 * both). One card per ORDER (every label shipping it rides one card; an
 * unpaired label is its own card): platform + order number on top, its
 * products with quantities beneath — nothing else on the card. The cards are
 * a fixed-width rail; the open card's documents fill the rest (`record.rail`).
 */

import type { TriageViewDecl } from '@/design-system/components/triage-card-list/triage-view';

/** The pairing cut — the status chips and their one URL param. */
export const LABEL_PAIRING_PARAM = 'pairing';
export const LABEL_PAIRING_KEYS = ['unpaired', 'paired'] as const;
export type LabelPairingKey = (typeof LABEL_PAIRING_KEYS)[number];

const SHARED = {
  grain: 'order',
  noun: { one: 'order', many: 'orders' },
  recordParams: [],
  chips: { owner: 'face', param: LABEL_PAIRING_PARAM },
  paging: 'client',
  status: 'date',
  // A line reads ×quantity · product title; carrier, tracking and prints live on the open record.
  facts: [{ id: 'qty', tier: 'always' }],
  sections: null,
  // The card paints no next step; Print / Reprint is the open record's one verb.
  next: [],
} as const satisfies Omit<TriageViewDecl, 'id' | 'listLabel' | 'testIdPrefix' | 'bodyTestId' | 'storageKeys'>;

export const LABEL_INTAKE_LABELS_VIEW: TriageViewDecl = {
  ...SHARED,
  id: 'label-intake.labels',
  listLabel: 'Labels to print',
  testIdPrefix: 'label-card',
  bodyTestId: 'label-cards',
  storageKeys: { pageMode: 'cf:label-cards:scroll', scrollTop: 'cf:label-cards:scroll-top' },
};

export const LABEL_INTAKE_PAPERWORK_VIEW: TriageViewDecl = {
  ...SHARED,
  id: 'label-intake.paperwork',
  listLabel: 'Paperwork to print',
  testIdPrefix: 'paperwork-card',
  bodyTestId: 'paperwork-cards',
  storageKeys: { pageMode: 'cf:paperwork-cards:scroll', scrollTop: 'cf:paperwork-cards:scroll-top' },
};

export const LABEL_INTAKE_PRINTED_VIEW: TriageViewDecl = {
  ...SHARED,
  id: 'label-intake.printed',
  listLabel: 'Printed labels and paperwork',
  testIdPrefix: 'printed-card',
  bodyTestId: 'printed-cards',
  storageKeys: { pageMode: 'cf:printed-cards:scroll', scrollTop: 'cf:printed-cards:scroll-top' },
};
