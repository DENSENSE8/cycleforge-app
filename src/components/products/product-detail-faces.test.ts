import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  gradeChipClass,
  gradeChipLabel,
  resolveListingLink,
  UNGRADED,
} from '@/components/products/product-detail-faces';
import { conditionGradeTone } from '@/lib/condition-tone';

type PlatformRow = Parameters<typeof resolveListingLink>[0];

function row(patch: Partial<PlatformRow>): PlatformRow {
  return {
    id: 1,
    platform: 'ecwid',
    platform_sku: null,
    platform_item_id: null,
    account_name: null,
    display_name: null,
    image_url: null,
    listing_url: null,
    is_active: true,
    ...patch,
  };
}

describe('gradeChipLabel', () => {
  it('uses the verbose detail-panel wording for real grades', () => {
    assert.equal(gradeChipLabel('USED_A'), 'Used — A');
    assert.equal(gradeChipLabel('BRAND_NEW'), 'Brand New');
    assert.equal(gradeChipLabel('PARTS'), 'For Parts');
  });

  it('names the ungraded bucket rather than leaking the enum sentinel', () => {
    assert.equal(gradeChipLabel(UNGRADED), 'Ungraded');
  });
});

describe('gradeChipClass', () => {
  it('paints a real grade with the shared tone SoT', () => {
    assert.ok(gradeChipClass('USED_A').includes(conditionGradeTone('USED_A').badge));
  });

  it('never paints ungraded units with the USED_C fallback hue', () => {
    // The tone SoT falls back to USED_C for unknown codes; an ungraded unit
    // has no grade, so claiming a C would be a lie of colour.
    const ungraded = gradeChipClass(UNGRADED);
    assert.ok(!ungraded.includes(conditionGradeTone('USED_C').badge));
    assert.equal(ungraded, 'bg-surface-sunken text-text-muted');
  });
});

describe('resolveListingLink', () => {
  it('prefers the stored listing_url and calls it a listing', () => {
    const link = resolveListingLink(
      row({ listing_url: 'https://usavshop.com/products/Thing-p491992696' }),
    );
    assert.equal(link.href, 'https://usavshop.com/products/Thing-p491992696');
    assert.equal(link.label, 'Open listing');
  });

  it('admits when an ecwid row can only reach storefront search', () => {
    // This is the whole point of Phase 0: before the mirror sync captures
    // `url`, the only derivable href drops the reader in a search box, and the
    // label has to say so rather than promising a product page.
    const link = resolveListingLink(row({ platform: 'ecwid', platform_sku: 'AB-1' }));
    assert.match(link.href ?? '', /\/products\/search\?/);
    assert.equal(link.label, 'Open storefront search');
  });

  it('deep-links marketplace channels straight from their item id', () => {
    const ebay = resolveListingLink(
      row({ platform: 'ebay', platform_item_id: '123456789012' }),
    );
    assert.equal(ebay.href, 'https://www.ebay.com/itm/123456789012');
    assert.equal(ebay.label, 'Open listing');

    const amazon = resolveListingLink(
      row({ platform: 'amazon', platform_item_id: 'B0ABCDEFGH' }),
    );
    assert.equal(amazon.href, 'https://www.amazon.com/dp/B0ABCDEFGH');
    assert.equal(amazon.label, 'Open listing');
  });

  it('reports no link when the channel has nothing to build one from', () => {
    // Zoho is inventory identity, not a storefront — the URL SoT refuses to
    // invent a usavshop link for it, and the chip must stay disabled.
    const link = resolveListingLink(row({ platform: 'zoho', platform_sku: 'AB-1' }));
    assert.equal(link.href, null);
    assert.equal(link.label, 'No listing link');
  });
});
