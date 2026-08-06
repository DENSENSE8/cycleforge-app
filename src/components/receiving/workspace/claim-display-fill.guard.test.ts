/**
 * Unbox Displays → Ticket → Claim fill (2026-08-05, updated for inline CTAs).
 *
 * Nested Ticket topic used to inherit Displays content inset + outer-column
 * scroll, so actions floated inset above dead white space. Fill height + claim
 * horizontal full-bleed cancel the `px-4` inset; the claim panel owns scroll.
 * Primary CTAs live in a sticky File footer (no Cancel). Displays must not
 * add host `pb-*` — that left a dead strip under the body that `h-full` cannot
 * cancel.
 *
 * Displays claim mounts `chrome="display"` — no gray title / PO restatement /
 * X (strip + tabs + StationContextBar + column dismiss own that chrome).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

const SLIDER = 'src/design-system/components/SectionTabsSlider.tsx';
const UNBOX_TABS = 'src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx';
const DISPLAYS = 'src/components/receiving/workspace/ReceivingDisplaysPushStack.tsx';
const TICKET = 'src/components/receiving/workspace/line-edit/TicketDisplayHost.tsx';
const PHOTOS = 'src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx';
const CLAIM = 'src/components/receiving/workspace/ReceivingClaimPanel.tsx';
const LINE_EDIT = 'src/components/receiving/workspace/LineEditPanel.tsx';
const CLAIM_HEADER = 'src/components/receiving/workspace/claim/components/ClaimModalHeader.tsx';
const PHASE = 'src/components/receiving/workspace/claim/components/ClaimPhaseActions.tsx';
const COMPOSE = 'src/components/receiving/workspace/claim/components/ClaimComposeStep.tsx';
const EDITOR = 'src/components/receiving/workspace/claim/components/ClaimTemplateEditor.tsx';
const DENSE = 'src/design-system/components/DenseComposeFields.tsx';
const TICKET_PICKER = 'src/components/support/link/TicketPicker.tsx';
const RECIPIENTS = 'src/components/receiving/workspace/claim/components/ClaimRecipientsField.tsx';
const BACKUP = 'src/components/receiving/workspace/claim/components/ClaimBackupStep.tsx';
const SELLER = 'src/components/receiving/workspace/claim/components/ClaimSellerMessagePanel.tsx';
const REPLY = 'src/components/receiving/workspace/claim/components/ClaimTicketReply.tsx';
const PHOTO_PICKER = 'src/components/receiving/workspace/claim/components/ClaimPhotoPicker.tsx';
const MOVE = 'src/components/receiving/workspace/line-edit/MovePhotosBetweenPoPanel.tsx';
const SEND = 'src/components/receiving/workspace/SendPhotoNotePanel.tsx';

describe('Unbox Displays claim fill + pinned footer', () => {
  it('SectionTabsSlider offers opt-in fillHeight without changing the default', () => {
    const slider = read(SLIDER);
    assert.match(
      slider,
      /fillHeight\s*=\s*false/,
      'fillHeight must default off so Workbench / Support callers stay content-sized',
    );
    assert.match(
      slider,
      /fillHeight && 'flex h-full min-h-0 flex-col'/,
      'fill root owns column height',
    );
    assert.match(
      slider,
      /fillHeight && 'flex min-h-0 flex-1 flex-col'/,
      'tab body owns remaining height',
    );
    assert.match(
      slider,
      /fillHeight && active && 'flex h-full min-h-0 flex-col'/,
      'active tabpanel fills the body',
    );
  });

  it('Unbox Displays enables fillHeight and drops outer-column scroll', () => {
    const displays = read(DISPLAYS);
    const tabs = read(UNBOX_TABS);
    assert.match(
      tabs,
      /fillHeight=\{fillHeight\}/,
      'UnboxSectionTabs must thread fillHeight into SectionTabsSlider',
    );
    assert.match(
      displays,
      /fillHeight/,
      'Displays push must opt into fillHeight',
    );
    assert.match(
      displays,
      /DISPLAYS_FLUSH_HOST/,
      'outer column uses flush host (overflow-hidden lives on the SoT token)',
    );
    assert.doesNotMatch(
      displays,
      /overflow-y-auto/,
      'outer overflow-y-auto is what floated Cancel/Next above dead space',
    );
  });

  it('Ticket → Claim fills remaining height on flush Displays host', () => {
    const ticket = read(TICKET);
    const displays = read(DISPLAYS);
    assert.match(
      ticket,
      /flex h-full min-h-0 flex-col/,
      'ticket topic fills the active tabpanel',
    );
    assert.match(
      displays,
      /DISPLAYS_FLUSH_HOST/,
      'Displays body host is the flush SoT (px-0 — no -mx-4 cancel dance)',
    );
    assert.doesNotMatch(
      ticket,
      /-mx-4/,
      'no -mx-4 cancel — flush host means Claim is already column-edge',
    );
    assert.doesNotMatch(
      ticket,
      /-mb-2/,
      'no bottom negative-margin hack — Displays must not pad the column bottom',
    );
    assert.doesNotMatch(
      displays,
      /\bpb-\d+\b/,
      'Displays host must not add pb-* under pinned claim/chat footers',
    );
    assert.doesNotMatch(
      ticket,
      /\bTabDisplay\b/,
      'Ticket topic has no Chat · Claim nested TabDisplay — presence-exclusive body',
    );
    assert.doesNotMatch(
      ticket,
      /TICKET_TABS/,
      'no Chat · Claim tab catalog on TicketDisplayHost',
    );
    assert.match(
      ticket,
      /const hasTicket = ticketId != null/,
      'body gates on linked carton ticket id',
    );
    assert.match(
      ticket,
      /hasTicket \? \([\s\S]*SupportTicketDetail[\s\S]*\) : \([\s\S]*ReceivingClaimPanel/,
      'linked ticket → Chat; no ticket → Claim (New ticket · Link existing)',
    );
    assert.doesNotMatch(
      ticket,
      /No linked ticket on this carton/,
      'empty Chat state removed — no ticket means Claim-only',
    );
  });

  it('create/link opens Chat — presence flips Ticket body after link', () => {
    const line = read(LINE_EDIT);
    assert.match(
      line,
      /onClaimTicketCreated[\s\S]*ticketAction:\s*'chat'/,
      'filing/linking a ticket opens Chat (no sticky Claim mid-wizard)',
    );
    assert.doesNotMatch(
      line,
      /ticketActionRaw === 'claim'[\s\S]*ticketAction:\s*'claim'/,
      'sticky-write claim verb removed — presence alone chooses Claim vs Chat',
    );
  });

  it('ReceivingClaimPanel pins sticky File footer; scroll body owns sections', () => {
    const claim = read(CLAIM);
    const phase = read(PHASE);
    const compose = read(COMPOSE);
    assert.match(
      claim,
      /flex h-full min-h-0 flex-col/,
      'claim panel is a column that can pin chrome',
    );
    assert.match(
      claim,
      /min-h-0 flex-1[\s\S]*overflow-y-auto/,
      'middle body is the only scroll owner',
    );
    assert.match(
      claim,
      /px-0 py-0/,
      'scroll body is flush — sections/rows own gutters, not outer px-4',
    );
    assert.doesNotMatch(
      claim,
      /overflow-y-auto space-y-8 px-4 py-4/,
      'no nested-box scroll inset (space-y-8 px-4 py-4)',
    );
    assert.match(
      claim,
      /border-b border-border-hairline/,
      'wizard sections separate with full-bleed hairlines',
    );
    assert.match(
      claim,
      /ClaimActionFooter/,
      'sticky File/Update footer mounts as sibling of the scroll body',
    );
    assert.doesNotMatch(
      compose,
      /ClaimPhaseActions|ClaimReviewStep/,
      'Ticket is editable fields only — no review dupe or inline File CTA',
    );
    assert.match(
      phase,
      /data-testid="claim-phase-actions"/,
      'phase actions are a named row',
    );
    assert.match(
      phase,
      /FlushTerminalFooter/,
      'sticky File footer composes FlushTerminalFooter Macro SoT',
    );
    assert.match(
      phase,
      /layout="cluster"/,
      'Claim File footer uses cluster layout (leading + CTA)',
    );
    assert.doesNotMatch(
      phase,
      /\bCancel\b/,
      'no Cancel CTA — dismiss via header X / Displays →|',
    );
  });

  it('Claim compose Subject/Body use sheet-band faces, not nested bordered cards', () => {
    const editor = read(EDITOR);
    const dense = read(DENSE);
    assert.match(
      editor,
      /DenseComposeSubjectInput/,
      'Subject uses DenseCompose underline face',
    );
    assert.match(
      editor,
      /DenseComposeBodyBand/,
      'Body mounts in DenseCompose sunken band',
    );
    assert.doesNotMatch(
      editor,
      /rounded-lg border border-border-default bg-surface-card/,
      'Subject/Body must not reintroduce nested bordered card inputs',
    );
    assert.match(
      dense,
      /border-0 border-b-2/,
      'Subject face is underline (border-b-2), not a box',
    );
    assert.match(
      dense,
      /bg-surface-sunken/,
      'Body band is a sunken plane',
    );
    assert.match(
      dense,
      /inset-field/,
      'Body textarea padding is inset-field only',
    );
  });

  it('Claim compose uses flush searchable claim-type combobox; no duplicate Ticket title', () => {
    const compose = read(COMPOSE);
    const editor = read(EDITOR);
    const claim = read(CLAIM);
    const select = read('src/design-system/components/SearchableSelectField.tsx');
    assert.match(
      compose,
      /SearchableSelectField/,
      'claim type is SearchableSelectField (house combobox)',
    );
    assert.match(
      compose,
      /appearance="flush"/,
      'claim type combobox is flush (no radius / pad chrome)',
    );
    assert.match(
      compose,
      /Standard types/,
      'options are grouped under Standard types',
    );
    assert.match(
      select,
      /from 'cmdk'/,
      'flush combobox uses cmdk (shadcn Command engine) for keyboard list nav',
    );
    assert.match(
      select,
      /!rounded-none|rounded-none/,
      'flush panel / trigger has zero corner radius',
    );
    assert.doesNotMatch(
      compose,
      /HorizontalButtonSlider/,
      'no horizontal pill slider for claim types',
    );
    assert.doesNotMatch(
      editor,
      /Support ticket/,
      'no Support ticket (editable) meta — Ticket identity is the compose fields',
    );
    assert.doesNotMatch(
      claim,
      /text-role-caption font-semibold uppercase tracking-\[0\.14em\] text-text-muted/,
      'no visible 1. PHOTOS / 2. TICKET section titles in scroll body',
    );
  });

  it('TicketPicker + Recipients + Backup + Seller use sheet-band chrome, not nested cards', () => {
    const picker = read(TICKET_PICKER);
    const recipients = read(RECIPIENTS);
    const backup = read(BACKUP);
    const phase = read(PHASE);
    const seller = read(SELLER);
    const reply = read(REPLY);
    const photoPicker = read(PHOTO_PICKER);

    assert.match(
      picker,
      /DenseComposeSearchInput/,
      'TicketPicker search uses DenseCompose underline face',
    );
    assert.doesNotMatch(
      picker,
      /rounded-xl border/,
      'TicketPicker results must not use rounded-xl bordered shell',
    );
    assert.doesNotMatch(
      picker,
      /rounded-lg border border-border-soft bg-surface-card inset-field/,
      'TicketPicker search must not be a rounded inset-field card',
    );

    assert.doesNotMatch(
      recipients,
      /rounded-lg border border-border-soft/,
      'Recipients must not wrap in a rounded bordered card',
    );
    assert.match(
      recipients,
      /border-t border-border-hairline/,
      'Recipients separates with a hairline, not a card',
    );
    assert.match(
      recipients,
      /appearance="flush"/,
      'Recipients VisibilityToggle is flush (square, no pad)',
    );
    assert.match(
      recipients,
      /pl-3 pr-0/,
      'Recipients header keeps left label gutter; toggle is right-edge flush',
    );
    assert.doesNotMatch(
      recipients,
      /\bpt-3\b|\bspace-y-2\b/,
      'Recipients must not use padded section air',
    );
    assert.match(
      photoPicker,
      /buttonClassName/,
      'claim density buttons force square chrome via buttonClassName',
    );
    assert.match(
      photoPicker,
      /!rounded-none/,
      'claim photo controls force zero corner radius',
    );

    assert.doesNotMatch(
      backup,
      /rounded-lg border/,
      'Backup must not be a rounded bordered island',
    );
    assert.match(
      backup,
      /bg-surface-sunken/,
      'Backup is a sunken band on the sticky File footer',
    );
    assert.doesNotMatch(
      backup,
      /\bmx-3\b/,
      'Backup must not use mx-3 margin island',
    );
    assert.match(
      phase,
      /ClaimBackupStep/,
      'Backup note mounts as leading content on the sticky File footer',
    );

    assert.match(
      seller,
      /DenseComposeBodyBand/,
      'Seller message uses DenseCompose sunken band',
    );
    assert.doesNotMatch(
      seller,
      /rounded-lg border border-border-default bg-surface-card/,
      'Seller textarea must not be a nested bordered card',
    );

    assert.doesNotMatch(
      reply,
      /rounded-lg border bg-surface-card inset-field/,
      'Ticket reply composer must not use rounded bordered card chrome',
    );
    assert.match(
      reply,
      /bg-surface-sunken/,
      'Ticket reply composer sits on a sunken plane',
    );

    assert.match(
      photoPicker,
      /rounded-none border border-dashed/,
      'Photos empty state is flush (rounded-none dashed), not rounded-2xl',
    );
    assert.doesNotMatch(
      photoPicker,
      /rounded-full bg-surface-card/,
      'Photos empty camera plate is square flush chrome, not a rounded-full island',
    );
    assert.match(
      photoPicker,
      /gap-0/,
      'claim photo grid/controls use gap-0 (Media Library keeps shared gaps)',
    );
    assert.doesNotMatch(
      photoPicker,
      /\bmb-2\b/,
      'claim photo header must not use mb-2 air above the grid',
    );
    assert.doesNotMatch(
      photoPicker,
      /\bmt-2\b/,
      'claim photo help must not use mt-2 air below the grid',
    );

    const photosStep = read(
      'src/components/receiving/workspace/claim/components/ClaimPhotosStep.tsx',
    );
    assert.doesNotMatch(
      photosStep,
      /\bpx-3\b/,
      'Photos step shell is column-edge (no outer px-3)',
    );
  });


  it('Displays claim / Move / Send omit modal identity headers', () => {
    const ticket = read(TICKET);
    const photos = read(PHOTOS);
    const header = read(CLAIM_HEADER);
    const move = read(MOVE);
    const send = read(SEND);
    const claim = read(CLAIM);

    assert.match(
      ticket,
      /chrome="display"/,
      'Ticket→Claim must mount display chrome (no PO title band)',
    );
    assert.match(
      photos,
      /chrome="display"/,
      'Photos→Move/Send must mount display chrome',
    );
    assert.match(
      header,
      /chrome === 'display'\) return null/,
      'ClaimModalHeader must no-op under display chrome',
    );
    assert.match(
      claim,
      /chrome = 'modal'/,
      'ReceivingClaimPanel defaults to modal chrome for overlay hosts',
    );
    assert.match(
      move,
      /chrome === 'modal'/,
      'Move photos title band only renders for modal chrome',
    );
    assert.match(
      send,
      /chrome === 'modal'/,
      'Send photos title band only renders for modal chrome',
    );
  });

  it('Move photos picker is flush — DenseCompose search + TabDisplay segment, no bubble/box', () => {
    const move = read(MOVE);
    assert.match(
      move,
      /DenseComposeSearchInput/,
      'Move target search uses the DenseCompose underline face (shared with TicketPicker), not a rounded bubble',
    );
    assert.match(
      move,
      /appearance="segment"/,
      'To/From carton toggle is a flush TabDisplay segment',
    );
    assert.doesNotMatch(
      move,
      /PaneHeaderTabs/,
      'no inverse-fill PaneHeaderTabs pill on the Move direction toggle',
    );
    assert.doesNotMatch(
      move,
      /rounded-lg border border-border-soft/,
      'recent-cartons list + search are full-bleed (divide/border-b rows), not rounded-lg boxes',
    );
  });

  it('Send photos body is flush — sunken compose band, hairline segments, no boxed grammar', () => {
    const send = read(SEND);
    assert.match(
      send,
      /overflow-y-auto px-0 py-0/,
      'scroll body is flush — pickers/segments own gutters, not outer px-4',
    );
    assert.doesNotMatch(
      send,
      /overflow-y-auto px-4 py-3/,
      'no outer re-inset scroll (px-4 py-3) around Displays body',
    );
    assert.match(
      send,
      /ClaimRecipientsField/,
      'Send reuses claim Recipients flush VisibilityToggle — no page-local Internal/Public twin',
    );
    assert.doesNotMatch(
      send,
      /VisibilityToggle/,
      'Send must not mount VisibilityToggle directly — ClaimRecipientsField is the SoT',
    );
    assert.match(
      send,
      /DenseComposeBodyBand/,
      'note composer uses the DenseCompose sunken band, not a boxed textarea',
    );
    assert.doesNotMatch(
      send,
      /rounded-lg border bg-surface-card inset-field/,
      'note textarea must not reintroduce a rounded bordered card',
    );
    assert.match(
      send,
      /border-b border-border-hairline/,
      'ticket / photos / note separate with full-bleed hairlines',
    );
    assert.doesNotMatch(
      send,
      /rounded-lg border border-border-soft bg-surface-canvas/,
      'locked-ticket callout is a full-bleed sunken band, not a rounded box',
    );
  });
});
