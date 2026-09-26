/** The shape every photo-analysis provider must produce. */
export interface PhotoAnalysisMetadata {
  /** OCR snippets read off the photo (label text, PO numbers, etc.). */
  ocr_text: string[];
  /** Scene / product labels (or SKU candidates from the local vision box). */
  labels: string[];
  /** True when visible damage is detected (drives claim/disposition surfaces). */
  damage_detected: boolean;
  /** Free-text on what damage was seen; null when none. */
  damage_notes: string | null;
  /** One-line human caption for the photo. */
  caption: string;
}

/** Damage cues shared by every provider so "damaged" means the same thing everywhere. */
export const DAMAGE_KEYWORDS = [
  'damage',
  'damaged',
  'tear',
  'dent',
  'crack',
  'cracked',
  'broken',
  'crumpled',
  'scratch',
  'scratched',
  'shattered',
] as const;
