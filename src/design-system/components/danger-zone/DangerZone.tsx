'use client';

/**
 * Danger zone (operator 2026-10-08): destructive verbs close a record's
 * actions in ONE titled section, every button and its hotkey painted in full —
 * never folded behind a dropdown. Pressing one (click or key) opens a square
 * confirmation popover anchored to it (confirm · Cancel). A danger verb whose
 * second step is a pick (Report out of stock) opens `RecordActionStrip`'s
 * centered picker dialog instead. `RecordActionStrip` paints the same layer on
 * every face.
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/design-system/primitives/Button';
import { KeyboardChord } from '@/design-system/primitives/KeyboardKey';
import { Popover } from '@/design-system/primitives/Popover';
import type { AnchoredPlacement } from '@/design-system/primitives/AnchoredLayer';
import { hotkeyChord, hotkeyFires } from '@/lib/keyboard/key-registry';
import { cn } from '@/utils/_cn';

export interface DangerZoneItem {
  id: string;
  label: string;
  icon?: ReactNode;
  hotkey?: string;
  disabled?: boolean;
  disabledReason?: string;
  /** One sentence under the question in the square confirmation — what happens. */
  confirmDetail?: string;
  /** Runs once the square confirmation is accepted. */
  run?: () => void | Promise<void>;
}

/** The item whose confirmation is up, or none. */
export type DangerZoneView = { id: string } | null;

const CONFIRM_CARD_CLASS = 'flex aspect-square w-64 flex-col p-4';
/** The danger ink on a ghost row; shared by the section's buttons. */
export const DANGER_ROW_CLASS = 'w-full justify-start font-medium text-text-danger hover:bg-surface-danger hover:text-text-danger';

/** The square confirmation. Enter (its focused confirm button) or the verb's own key again confirms; Escape cancels. */
export function DangerConfirmCard({
  item,
  onConfirm,
  onCancel,
  testId,
}: {
  item: Pick<DangerZoneItem, 'label' | 'icon' | 'hotkey' | 'confirmDetail'>;
  onConfirm: () => void;
  onCancel: () => void;
  testId: string;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // A frame late: a closing menu hands focus back to its trigger first.
    const frame = window.requestAnimationFrame(() => confirmRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      role="alertdialog"
      aria-label={`${item.label}?`}
      className={CONFIRM_CARD_CLASS}
      data-testid={`${testId}-confirm`}
      onKeyDown={(event) => {
        if (!item.hotkey || !hotkeyFires(item.hotkey, event)) return;
        event.preventDefault();
        event.stopPropagation();
        onConfirm();
      }}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-danger text-text-danger [&_svg]:size-5" aria-hidden>
        {item.icon ?? <AlertTriangle />}
      </span>
      <p className="mt-3 text-role-title font-semibold text-text-default">{item.label}?</p>
      <p className="mt-1 min-h-0 flex-1 overflow-hidden text-role-caption text-text-soft">
        {item.confirmDetail ?? 'This cannot be taken back from here.'}
      </p>
      <div className="mt-3 flex flex-col gap-1.5">
        <Button
          ref={confirmRef}
          type="button"
          variant="danger"
          size="md"
          className="w-full justify-between"
          data-testid={`${testId}-confirm-run`}
          onClick={onConfirm}
        >
          <span className="truncate">{item.label}</span>
          {item.hotkey ? <KeyboardChord chord={hotkeyChord(item.hotkey)} size="sm" tone="inverse" /> : null}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="w-full" data-testid={`${testId}-confirm-cancel`} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * The square confirmation a pressed item opens, anchored to where it was
 * pressed. Controlled, so a hotkey opens an item directly.
 */
export function DangerZoneLayer({
  items,
  view,
  onViewChange,
  anchorRef,
  placement = 'bottom-end',
  testId,
}: {
  items: readonly DangerZoneItem[];
  view: DangerZoneView;
  onViewChange: (view: DangerZoneView) => void;
  anchorRef: RefObject<HTMLElement | null>;
  placement?: AnchoredPlacement;
  testId: string;
}) {
  const item = view ? (items.find((candidate) => candidate.id === view.id) ?? null) : null;
  const close = () => onViewChange(null);
  return (
    <Popover
      open={item != null}
      onClose={close}
      anchorRef={anchorRef}
      placement={placement}
      gap={6}
      data-testid={`${testId}-layer`}
      data-view={item?.id}
    >
      {item ? (
        <DangerConfirmCard
          item={item}
          testId={testId}
          onConfirm={() => {
            close();
            void item.run?.();
          }}
          onCancel={close}
        />
      ) : null}
    </Popover>
  );
}

/** One danger row: spelled out, its hotkey always painted. */
export function DangerZoneButton({
  item,
  onPress,
  testId,
  buttonRef,
}: {
  item: DangerZoneItem;
  onPress: () => void;
  testId: string;
  buttonRef?: (node: HTMLButtonElement | null) => void;
}) {
  return (
    <Button
      ref={buttonRef}
      type="button"
      size="sm"
      variant="ghost"
      icon={item.icon}
      disabled={item.disabled}
      title={item.disabled ? item.disabledReason : undefined}
      aria-haspopup="dialog"
      data-testid={`${testId}-${item.id}`}
      className={DANGER_ROW_CLASS}
      onClick={onPress}
    >
      <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
      {item.hotkey ? <KeyboardChord chord={hotkeyChord(item.hotkey)} size="sm" tone="default" /> : null}
    </Button>
  );
}

/** The titled section frame: hairline, "Danger zone", then the rows. */
export function DangerZoneSection({ testId, className, children }: { testId: string; className?: string; children: ReactNode }) {
  return (
    <section
      aria-label="Danger zone"
      className={cn('mt-2 flex flex-col gap-0.5 border-t border-border-soft pt-2', className)}
      data-testid={`${testId}-danger`}
    >
      <p className="px-2.5 pb-1 text-left text-role-caption font-semibold text-text-danger">Danger zone</p>
      {children}
    </section>
  );
}

/**
 * Section plus layer for a surface outside `RecordActionStrip` (a form's
 * delete, a rail's red selection verbs). Clicks only; a strip owns hotkeys.
 */
export function DangerZone({
  items,
  testId,
  className,
}: {
  items: readonly DangerZoneItem[];
  testId: string;
  className?: string;
}) {
  const [view, setView] = useState<DangerZoneView>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  if (items.length === 0) return null;
  return (
    <DangerZoneSection testId={testId} className={className}>
      {items.map((item) => (
        <DangerZoneButton
          key={item.id}
          item={item}
          testId={testId}
          buttonRef={(node) => {
            if (node) buttons.current.set(item.id, node);
            else buttons.current.delete(item.id);
          }}
          onPress={() => {
            anchorRef.current = buttons.current.get(item.id) ?? null;
            setView({ id: item.id });
          }}
        />
      ))}
      <DangerZoneLayer items={items} view={view} onViewChange={setView} anchorRef={anchorRef} testId={testId} />
    </DangerZoneSection>
  );
}
