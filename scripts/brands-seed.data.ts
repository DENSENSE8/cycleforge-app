/**
 * The seed vocabulary for scripts/brands-seed.ts — phase0-findings
 * §"Alias seed candidates" (leading-token and bigram evidence from 1,684
 * catalog titles, 6,090 listing titles and 2,760 receiving lines).
 *
 * Deliberately NOT seeded (operator rulings pending, phase0 open questions):
 * the USAV house brand and platform tokens (xbox, wii, ps3/ps4, playstation).
 */

import type { BrandSeedSpec } from '@/lib/brands/seed';

const bose = (line: string, aliases: string[], reviewOnlyAliases: string[] = []): BrandSeedSpec => ({
  name: line,
  kind: 'product_line',
  aliases,
  reviewOnlyAliases,
});

export const BRAND_SEED: BrandSeedSpec[] = [
  {
    name: 'Bose',
    kind: 'brand',
    aliases: ['Bose', 'Bose Corp', 'Bose Corporation', 'Boser', 'Genuine Bose', 'OEM Bose'],
    // "RC" is Bose remote shorthand in titles, but not only Bose's.
    reviewOnlyAliases: ['RC'],
    children: [
      bose('Wave', ['Wave', 'Bose Wave', 'Wave Radio', 'Wave Music System']),
      bose('SoundDock', ['SoundDock', 'Bose SoundDock']),
      bose('SoundTouch', ['SoundTouch', 'Bose SoundTouch']),
      bose('SoundLink', ['SoundLink', 'Bose SoundLink'], ['SL']),
      bose('Lifestyle', ['Lifestyle', 'Bose Lifestyle']),
      bose('Acoustimass', ['Acoustimass', 'Bose Acoustimass', 'Bose AM'], ['AM']),
      bose('CineMate', ['CineMate', 'Bose CineMate']),
      bose('Companion', ['Companion', 'Bose Companion']),
      bose('QuietComfort', ['QuietComfort', 'QC', 'Bose QC', 'Bose QuietComfort']),
      bose('Solo', ['Solo', 'Bose Solo']),
      bose('Jewel', ['Jewel', 'Jewel Cube', 'Bose Jewel']),
      // "321" alone is a number; only after "bose" is it the line.
      bose('3-2-1', ['PS3-2-1', 'AV3-2-1', 'Bose 3-2-1', 'Bose 321']),
    ],
  },
  { name: 'Sony', kind: 'brand' },
  { name: 'JBL', kind: 'brand' },
  { name: 'Panasonic', kind: 'brand' },
  { name: 'Logitech', kind: 'brand' },
  { name: 'Apple', kind: 'brand' },
  { name: 'Klipsch', kind: 'brand' },
  { name: 'Infinity', kind: 'brand' },
  { name: 'Samsung', kind: 'brand' },
  { name: 'Motorola', kind: 'brand' },
  { name: 'Sonos', kind: 'brand' },
  { name: 'Yamaha', kind: 'brand' },
  { name: 'Anker', kind: 'brand' },
  { name: 'Harman Kardon', kind: 'brand', aliases: ['Harman', 'Harman/Kardon'] },
  { name: 'Polk Audio', kind: 'brand', aliases: ['Polk'] },
  { name: 'Definitive Technology', kind: 'brand' },
  { name: 'Dura Micro', kind: 'brand' },
  { name: 'Poly', kind: 'brand', children: [{ name: 'Plantronics', kind: 'brand' }] },
  {
    name: 'Rock Band',
    kind: 'franchise',
    publisher: 'Harmonix / Mad Catz',
    aliases: ['The Beatles Rock Band', 'Beatles Rock Band'],
  },
  { name: 'Guitar Hero', kind: 'franchise', publisher: 'Activision / RedOctane' },
];
