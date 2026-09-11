import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  directOpenForTypedHandle,
  isPrintedHandlePayload,
  parseInternalIdQuery,
  searchPageHrefForScanRoute,
  desktopSearchHref,
} from './internal-id';
import { decodedHandle } from '@/lib/barcode-routing';

describe('parseInternalIdQuery', () => {
  it('decodes a carton Digital Link QR the same as R-{id}', () => {
    const fromUrl = parseInternalIdQuery('https://usav.app.cycleforge.ai/m/r/99');
    const fromHandle = parseInternalIdQuery('R-99');
    assert.ok(fromUrl);
    assert.ok(fromHandle);
    assert.deepEqual(fromUrl.receivingIds, [99]);
    assert.deepEqual(fromHandle.receivingIds, [99]);
    assert.equal(fromUrl.exactHandle, true);
    assert.equal(fromHandle.exactHandle, true);
    assert.deepEqual(fromUrl.shipmentIds, []);
    assert.deepEqual(fromHandle.orderPks, []);
  });

  it('decodes a bare path carton link', () => {
    const keys = parseInternalIdQuery('/m/r/50297');
    assert.ok(keys);
    assert.deepEqual(keys.receivingIds, [50297]);
    assert.equal(keys.exactHandle, true);
  });

  it('decodes a receiving-line handle', () => {
    const keys = parseInternalIdQuery('L-900');
    assert.ok(keys);
    assert.deepEqual(keys.receivingLineIds, [900]);
    assert.equal(keys.exactHandle, true);
  });

  it('decodes a unit handle and a GS1 unit QR to the unit key', () => {
    const fromHandle = parseInternalIdQuery('U-451');
    assert.ok(fromHandle);
    assert.deepEqual(fromHandle.unitKeys, ['451']);
    assert.equal(fromHandle.exactHandle, true);

    const fromGs1 = parseInternalIdQuery(
      'https://usav.app.cycleforge.ai/01/00012345678905/21/ABC',
    );
    assert.ok(fromGs1);
    assert.deepEqual(fromGs1.unitKeys, ['ABC']);
  });

  it('a bare number is shipment + carton + order + unit PK, not an exact handle', () => {
    const keys = parseInternalIdQuery('50297');
    assert.ok(keys);
    assert.equal(keys.exactHandle, false);
    assert.deepEqual(keys.receivingIds, [50297]);
    assert.deepEqual(keys.shipmentIds, [50297]);
    assert.deepEqual(keys.orderPks, [50297]);
    assert.deepEqual(keys.unitKeys, ['50297']);
    assert.deepEqual(keys.handlingUnitIds, [50297]);
  });

  it('marketplace order #s and tracking stay out of Internal ID', () => {
    assert.equal(parseInternalIdQuery('12-34567-89012'), null);
    assert.equal(parseInternalIdQuery('1Z999AA10123456784'), null);
    assert.equal(parseInternalIdQuery('Bose Wave Radio'), null);
  });
});

describe('isPrintedHandlePayload', () => {
  it('claims carton QR / R-id / GS1 unit, not a typed order number', () => {
    assert.equal(isPrintedHandlePayload('https://usav.app.cycleforge.ai/m/r/99'), true);
    assert.equal(isPrintedHandlePayload('R-99'), true);
    assert.equal(isPrintedHandlePayload('12-34567-89012'), false);
    assert.equal(isPrintedHandlePayload('50297'), false);
  });
});

describe('searchPageHrefForScanRoute', () => {
  it('sends carton QR / R-id to search receiving, never /m/r', () => {
    const route = decodedHandle('https://usav.app.cycleforge.ai/m/r/99');
    assert.ok(route);
    assert.equal(route.redirect, '/m/r/99');
    assert.equal(searchPageHrefForScanRoute(route), '/search?sel=receiving:99');
    assert.equal(searchPageHrefForScanRoute(decodedHandle('R-99')!), '/search?sel=receiving:99');
  });

  it('sends numeric unit handles to search unit', () => {
    assert.equal(searchPageHrefForScanRoute(decodedHandle('U-451')!), '/search?sel=unit:451');
  });

  it('does not send GS1 serial URLs to /01 or /m — desktop search query instead', () => {
    const route = decodedHandle('https://usav.app.cycleforge.ai/01/00012345678905/21/ABC');
    assert.ok(route);
    assert.match(route.redirect ?? '', /^\/01\//);
    assert.equal(searchPageHrefForScanRoute(route), '/search?q=ABC');
  });

  it('maps every /m/ class onto a desktop path — never returns /m/', () => {
    assert.equal(desktopSearchHref('/m/l/900'), '/receiving/lines/900');
    assert.equal(desktopSearchHref('/m/u/CN1A2B3'), '/serial/CN1A2B3');
    assert.equal(desktopSearchHref('/m/b/A0101101'), '/bin/A0101101');
    assert.equal(desktopSearchHref('/m/h/12'), '/search?q=H-12');
    assert.equal(desktopSearchHref('/m/rs/33'), '/search?sel=repair:33');
    assert.equal(desktopSearchHref('/m/scan'), '/search');
    assert.ok(!desktopSearchHref('/m/r/99').startsWith('/m/'));
    assert.ok(!desktopSearchHref('/01/00012345678905/21/ABC').startsWith('/01/'));
  });
});

describe('directOpenForTypedHandle', () => {
  it('offers non-/search landings: line QC, support ticket, locations', () => {
    assert.equal(directOpenForTypedHandle('L-900')?.href, '/receiving/lines/900');
    assert.equal(directOpenForTypedHandle('T-9395')?.href, '/support?ticket=9395');
    assert.equal(directOpenForTypedHandle('A0101101')?.href, '/inventory?bin=A0101101');
    assert.equal(directOpenForTypedHandle('A-01-01-1-01')?.href, '/inventory?bin=A0101101');
  });

  it('routes a bay code (position 00) to the bays view, not the bin view', () => {
    const rack = directOpenForTypedHandle('A-01-01-1-00');
    assert.ok(rack);
    assert.match(rack.href, /tab=bays/);
    assert.match(rack.href, /code=A0101100/);
  });

  it('stays quiet for /search-rooted handles — their record hits land there', () => {
    assert.equal(directOpenForTypedHandle('R-99'), null);
    assert.equal(directOpenForTypedHandle('U-451'), null);
    assert.equal(directOpenForTypedHandle('REP-33'), null);
    assert.equal(directOpenForTypedHandle('H-12'), null);
  });

  it('stays quiet for typed text and guessed (redirect-less) routes', () => {
    assert.equal(directOpenForTypedHandle('Bose Wave Radio'), null);
    assert.equal(directOpenForTypedHandle('12-34567-89012'), null);
    assert.equal(directOpenForTypedHandle('KIT-IPH13-2635-000042'), null);
  });
});
