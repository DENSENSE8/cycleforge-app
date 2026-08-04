export { ProcedureChecklist } from './ProcedureChecklist';
export type { ProcedureStepRow } from './types';

// ProcedureDeck + PROCEDURE_STEP_FACE_HEIGHT stay in ./ProcedureDeck.tsx for the
// `unbox-work` lane and procedure-deck-order guard (readFile). Main dogfood does
// not mount the deck — do not re-export here or knip flags a dead barrel export.
