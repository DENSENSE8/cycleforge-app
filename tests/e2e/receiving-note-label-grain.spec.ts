import { test, expect } from '@playwright/test';
import path from 'path';
import { Pool } from 'pg';
import { resolveQaOrgId, QA_FIXTURE_PO_ID } from '@/lib/tenancy/qa-org';

/**
 * Note vs label grain — the two buffers, in a browser.
 *
 *   receiving_line.notes       the operator's item note. NEVER printed.
 *   receiving_line.label_note  the printed face center text.
 *
 * They were ONE column until 2026-07-31 (`2026-07-31b_receiving_lines_label_note.sql`),
 * which meant an operator could not record anything about an item without it
 * landing on the sticker, and could not re-word a sticker without rewriting the
 * record's note. `label-note-grain.guard.test.ts` pins the WIRING (which buffer
 * feeds which editor, which column each persist path patches) from source; this
 * spec is the behavioural half — it drives the two real composers and asserts
 * the two real columns.
 *
 * SoT: `.claude/rules/source-of-truth.md` → Note vs label grain.
 *
 * QA ORG ONLY (`.claude/rules/verify.md`): it seeds and mutates the fixture
 * carton's lines, which is what that tenant is for. Line 1 (`QA-MOCK-LINE-1`)
 * carries the UI grain walk; line 2 (`QA-MOCK-LINE-2`) is burned by the receive
 * test below, so the two never collide. `pnpm provision:qa-org` re-creates both.
 *
 * Entry is the `?openReceivingId=` deep link, not a scan: it is the Unbox
 * surface's focused-carton URL SoT (`useReceivingWorkspacePane`) and opens the
 * same workspace a scan lands on, without minting work attribution.
 *
 * Run: pnpm provision:qa-org && npx playwright test receiving-note-label-grain --project=qa-desktop
 */

const QA_STORAGE = path.join(__dirname, '..', '.auth', 'qa-admin.json');
test.use({ storageState: QA_STORAGE });

/** Unique per run so a re-run can never pass on a stale value. */
const RUN = Date.now().toString(36).toUpperCase();
const ITEM_SEED = `ITEMSEED-${RUN}`;
const FACE_SEED = `FACESEED-${RUN}`;
const ITEM_TYPED = `ITEMTYPED-${RUN}`;
const FACE_TYPED = `FACETYPED-${RUN}`;
const RECEIVE_NOTE = `RECVNOTE-${RUN}`;

interface GrainRow {
  notes: string | null;
  label_note: string | null;
  workflow_status: string | null;
}

let pool: Pool;
let cartonId: number | null = null;
/** Line 1 — the UI walk. */
let uiLineId: number | null = null;
/** Line 2 — burned by the receive. */
let receiveLineId: number | null = null;

async function lineIdFor(zohoLineItemId: string): Promise<number | null> {
  const res = await pool.query<{ id: string }>(
    `SELECT rl.id
       FROM receiving_line rl
       JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id
      WHERE rl.organization_id = $1
        AND rl.receiving_id = $2
        AND rz.zoho_line_item_id = $3
      ORDER BY rl.id DESC
      LIMIT 1`,
    [resolveQaOrgId(), cartonId, zohoLineItemId],
  );
  return res.rows[0] ? Number(res.rows[0].id) : null;
}

async function readGrain(lineId: number): Promise<GrainRow> {
  const res = await pool.query<GrainRow>(
    `SELECT notes, label_note, workflow_status
       FROM receiving_line
      WHERE id = $1 AND organization_id = $2`,
    [lineId, resolveQaOrgId()],
  );
  return res.rows[0] ?? { notes: null, label_note: null, workflow_status: null };
}

/** Seed both buffers to distinct known values — the whole point is telling them apart. */
async function seedGrain(lineId: number, notes: string | null, labelNote: string | null) {
  await pool.query(
    `UPDATE receiving_line SET notes = $1, label_note = $2, updated_at = NOW()
      WHERE id = $3 AND organization_id = $4`,
    [notes, labelNote, lineId, resolveQaOrgId()],
  );
}

test.beforeAll(async () => {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const carton = await pool.query<{ id: string }>(
    `SELECT id FROM receiving_carton
      WHERE organization_id = $1 AND zoho_purchaseorder_id = $2
      ORDER BY id DESC LIMIT 1`,
    [resolveQaOrgId(), QA_FIXTURE_PO_ID],
  );
  cartonId = carton.rows[0] ? Number(carton.rows[0].id) : null;
  if (!cartonId) return;
  uiLineId = await lineIdFor('QA-MOCK-LINE-1');
  receiveLineId = await lineIdFor('QA-MOCK-LINE-2');
});

test.afterAll(async () => {
  await pool?.end();
});

test.describe('receiving — item note vs printed label face', () => {
  test.skip(({ isMobile }) => !!isMobile, 'Unbox workbench is desktop-only');

  test('each composer writes its own column, and neither disturbs the other', async ({ page }) => {
    test.skip(!cartonId || !uiLineId, 'QA receiving fixture missing — run pnpm provision:qa-org');

    // Silence the label print: "Save & print" mounts a hidden iframe whose
    // embedded script calls window.print(). Unhooked, that blocks on a dialog.
    await page.addInitScript(() => {
      (window as unknown as { __prints: number }).__prints = 0;
      const bump = () => {
        (window.top as unknown as { __prints: number }).__prints += 1;
      };
      const hook = (w: Window) => {
        try {
          (w as unknown as { print: () => void }).print = bump;
        } catch {
          /* cross-origin — ignore */
        }
      };
      hook(window);
      new MutationObserver((muts) => {
        for (const m of muts)
          for (const n of Array.from(m.addedNodes))
            if (n instanceof HTMLIFrameElement)
              n.addEventListener('load', () => n.contentWindow && hook(n.contentWindow));
      }).observe(document.documentElement, { childList: true, subtree: true });
    });

    await seedGrain(uiLineId!, ITEM_SEED, FACE_SEED);

    await page.goto(`/unbox?openReceivingId=${cartonId}&lineId=${uiLineId}`);

    // --- Both buffers hydrate from their OWN column -------------------------
    const composer = page.getByRole('textbox', { name: 'Item note' });
    await expect(composer, 'the item-note composer did not mount').toBeVisible({ timeout: 30_000 });
    await expect(composer).toHaveValue(ITEM_SEED);

    // The label preview's center band renders the PRINTED buffer — and only it.
    // Asserted on the band itself, not "somewhere on the page": the item note
    // lives in a textarea whose value is a matchable text node too, so a
    // page-wide text query cannot tell the two buffers apart.
    const faceCenter = page.getByTestId('label-face-center').first();
    await expect(faceCenter, 'the carton label face did not render').toBeVisible({
      timeout: 20_000,
    });
    await expect(faceCenter).toHaveText(FACE_SEED);

    // --- Typing an item note must not touch the printed face ----------------
    await composer.fill(ITEM_TYPED);
    await composer.blur(); // auto-save on blur

    await expect
      .poll(async () => (await readGrain(uiLineId!)).notes, {
        timeout: 15_000,
        message: 'blurring the composer did not persist the item note',
      })
      .toBe(ITEM_TYPED);
    expect(
      (await readGrain(uiLineId!)).label_note,
      'the item-note composer rewrote the printed face',
    ).toBe(FACE_SEED);

    // The on-screen face is still the seeded one.
    await expect(faceCenter).toHaveText(FACE_SEED);

    // --- Editing the printed face must not touch the item note --------------
    // The Edit CTA is hover-revealed on the preview card; hover the face first.
    await page.locator('.label-preview-matrix').first().hover();
    const editLabel = page.getByRole('button', { name: /Edit label/i }).first();
    await expect(editLabel, 'Edit label CTA did not reveal on hover').toBeVisible({
      timeout: 10_000,
    });
    await editLabel.click();

    const centerField = page.getByPlaceholder(/Printed across the middle/i);
    await expect(centerField, 'the label editor did not open').toBeVisible({ timeout: 10_000 });
    await expect(centerField).toHaveValue(FACE_SEED);
    await centerField.fill(FACE_TYPED);
    await page.getByRole('button', { name: /Save & print/i }).click();

    await expect
      .poll(async () => (await readGrain(uiLineId!)).label_note, {
        timeout: 15_000,
        message: 'Save & print did not persist the edited face',
      })
      .toBe(FACE_TYPED);
    expect(
      (await readGrain(uiLineId!)).notes,
      'the label editor rewrote the operator item note',
    ).toBe(ITEM_TYPED);

    // The edited face is on screen (the editor closed on Save & print).
    await expect(page.getByTestId('label-face-center').first()).toHaveText(FACE_TYPED);

    // --- Both survive a reload: two durable columns, not view state ---------
    await page.reload();
    const composerAfter = page.getByRole('textbox', { name: 'Item note' });
    await expect(composerAfter).toBeVisible({ timeout: 30_000 });
    await expect(composerAfter).toHaveValue(ITEM_TYPED);
    await expect(page.getByTestId('label-face-center').first()).toHaveText(FACE_TYPED, {
      timeout: 20_000,
    });
  });
});

test.describe('receiving — a receive never erases the operator item note', () => {
  /**
   * The regression this pins: `mark-received` used a bare `SET notes = $1`
   * while the mobile QA sheet's Pass-all path posts `notes: null`
   * (`ReceivingQaActionSheet.tsx` → `markAllLines(targetLines, 'PASSED',
   * 'ACCEPT', null, …)`), so a phone-side pass silently erased whatever the
   * desktop operator had typed. Driven at the API layer — the phone shell adds
   * no coverage the route does not already decide.
   */
  test('mark-received with notes:null keeps the note; a supplied note overwrites', async ({
    request,
  }) => {
    test.skip(!receiveLineId, 'QA receiving fixture missing — run pnpm provision:qa-org');

    await seedGrain(receiveLineId!, ITEM_SEED, FACE_SEED);

    // The mobile Pass-all body, verbatim in the fields that matter: no note,
    // no Zoho ids (nothing to push), everything else defaulted by the route.
    const passAll = await request.post('/api/receiving/mark-received', {
      data: {
        receiving_line_id: receiveLineId,
        qa_status: 'PASSED',
        disposition_code: 'ACCEPT',
        notes: null,
        client_event_id: `e2e-grain-${RUN}-1`,
      },
    });
    expect(passAll.ok(), `mark-received failed (${passAll.status()}): ${await passAll.text()}`)
      .toBeTruthy();

    const afterPass = await readGrain(receiveLineId!);
    expect(afterPass.notes, 'a receive that supplied no note erased the operator note').toBe(
      ITEM_SEED,
    );
    // The receive is a lifecycle event; it has no business with the face either.
    expect(afterPass.label_note, 'a receive rewrote the printed face').toBe(FACE_SEED);

    // The other half of the contract: a receive that DOES supply a note sets it.
    const withNote = await request.post('/api/receiving/mark-received', {
      data: {
        receiving_line_id: receiveLineId,
        qa_status: 'PASSED',
        disposition_code: 'ACCEPT',
        notes: RECEIVE_NOTE,
        client_event_id: `e2e-grain-${RUN}-2`,
      },
    });
    expect(withNote.ok(), `mark-received (with note) failed (${withNote.status()})`).toBeTruthy();

    const afterNote = await readGrain(receiveLineId!);
    expect(afterNote.notes, 'a receive that supplied a note did not set it').toBe(RECEIVE_NOTE);
    expect(afterNote.label_note, 'a receive rewrote the printed face').toBe(FACE_SEED);
  });
});
