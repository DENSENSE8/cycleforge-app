'use client';

/**
 * The Allocate record's Fulfillment body: Internal (our floor's stages) and
 * External (the carrier's scans), one at a time or both in line.
 *
 * - A VERTICAL icon slider on the left (owner 2026-09-29): Internal
 *   (warehouse) · External (truck) · Both (layers), its face sliding up and
 *   down; the chosen source paints to its right with no side labels.
 * - The slider only exists when External has something to show; an order
 *   that has not been handed to a carrier paints Internal alone.
 * - Mobile first: on a touch screen a vertical swipe ON THE SLIDER walks it —
 *   down = next (toward Both), up = back (toward Internal). The body keeps
 *   native scrolling.
 */

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, LayoutGroup, motion, motionRole, useReducedMotion, usePointerFine } from '@/design-system/motion';
import { Layers, Truck, Warehouse } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

type FulfillmentSource = 'internal' | 'external' | 'both';

const SOURCES: readonly { id: FulfillmentSource; label: string; Icon: typeof Truck }[] = [
  { id: 'internal', label: 'Internal', Icon: Warehouse },
  { id: 'external', label: 'External', Icon: Truck },
  { id: 'both', label: 'Both', Icon: Layers },
];

/** Vertical travel (px) a swipe on the slider needs before it switches the source. */
const SWIPE_THRESHOLD_PX = 24;

function SourceSlider({
  sources,
  value,
  onChange,
}: {
  sources: readonly (typeof SOURCES)[number][];
  value: FulfillmentSource;
  onChange: (next: FulfillmentSource) => void;
}) {
  const groupId = useId();
  const reduce = useReducedMotion();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = sources.findIndex((source) => source.id === value);
  const transition = reduce ? { duration: 0 } : motionRole.record.pane.transition;

  // Radiogroup keys: arrows move AND select, Home/End jump.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = sources.length - 1;
    let next: number;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = Math.min(last, activeIndex + 1);
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = Math.max(0, activeIndex - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    onChange(sources[next]!.id);
    buttons.current[next]?.focus();
  };

  return (
    <LayoutGroup id={groupId}>
      <div
        role="radiogroup"
        aria-label="Fulfillment source"
        aria-orientation="vertical"
        data-testid="fulfillment-source-switch"
        onKeyDown={onKeyDown}
        className="flex shrink-0 flex-col gap-0.5 self-start rounded-mode-control bg-surface-sunken p-0.5"
      >
        {sources.map(({ id, label, Icon }, index) => {
          const active = id === value;
          return (
            <HoverTooltip key={id} label={label} placement="right" asChild>
              <button
                ref={(el) => {
                  buttons.current[index] = el;
                }}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={label}
                tabIndex={active ? 0 : -1}
                data-testid={`fulfillment-source-${id}-option`}
                onClick={() => onChange(id)}
                className={cn(
                  'ds-raw-button relative flex size-8 items-center justify-center rounded-mode-control transition-colors duration-mode-feedback',
                  active ? 'text-text-info' : 'text-text-muted hover:text-text-default',
                  focusRing('control'),
                )}
              >
                {active ? (
                  // One face sliding up and down the rail.
                  <motion.span
                    layoutId="fulfillment-source-face"
                    transition={transition}
                    className="absolute inset-0 rounded-mode-control bg-surface-card shadow-elev-soft"
                    aria-hidden
                  />
                ) : null}
                <Icon className="relative size-4" />
              </button>
            </HoverTooltip>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/**
 * `outbound` (default): Internal · External · Both — our floor first, then the carrier.
 * `inbound`: External · Internal · Both — the inverse operation (owner 2026-09-29):
 * the carrier brings it to us, then our floor unboxes and receives it; Both paints
 * the carrier row on top.
 */
export function RecordFulfillmentSources({
  internal,
  external,
  flow = 'outbound',
}: {
  internal: ReactNode;
  external: ReactNode | null;
  flow?: 'outbound' | 'inbound';
}) {
  const [source, setSource] = useState<FulfillmentSource>('both');
  // +1 = moved down the slider (content rises in from below), -1 = moved back up.
  const [direction, setDirection] = useState<1 | -1>(1);
  const reduce = useReducedMotion();
  const touch = !usePointerFine();

  if (external == null) {
    return (
      <section aria-label="Internal fulfillment" className="min-w-0" data-testid="fulfillment-source-internal">
        {internal}
      </section>
    );
  }

  const sources = flow === 'inbound' ? [SOURCES[1]!, SOURCES[0]!, SOURCES[2]!] : SOURCES;
  const order = sources.map((entry) => entry.id);
  const choose = (next: FulfillmentSource) => {
    if (next === source) return;
    setDirection(order.indexOf(next) > order.indexOf(source) ? 1 : -1);
    setSource(next);
  };
  const step = (by: 1 | -1) => {
    const next = order[order.indexOf(source) + by];
    if (next) choose(next);
  };
  const travel = reduce ? 0 : 24;
  // Variants read `custom` at exit time, so the leaving face moves the NEW way, not the way it arrived.
  const swap = {
    enter: (d: 1 | -1) => ({ opacity: 0, y: d * travel }),
    center: { opacity: 1, y: 0 },
    exit: (d: 1 | -1) => ({ opacity: 0, y: -d * travel }),
  };

  return (
    <div className="flex min-w-0 items-stretch gap-2 pl-4">
      {/* The swipe lives on the slider strip only, so the page still scrolls over the fulfillment body on a phone. */}
      <motion.div
        className="py-3"
        drag={touch ? 'y' : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        dragSnapToOrigin
        onDragEnd={(_, info) => {
          // The face follows the finger: down = the next source below, up = back.
          if (info.offset.y >= SWIPE_THRESHOLD_PX) step(1);
          else if (info.offset.y <= -SWIPE_THRESHOLD_PX) step(-1);
        }}
        data-testid="fulfillment-source-swipe"
      >
        <SourceSlider sources={sources} value={source} onChange={choose} />
      </motion.div>
      <div className="min-w-0 flex-1 overflow-hidden" data-testid="fulfillment-source-body" data-source={source}>
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={source}
            custom={direction}
            variants={swap}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduce ? 0 : 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="min-w-0"
          >
            {(flow === 'inbound' ? (['external', 'internal'] as const) : (['internal', 'external'] as const))
              .filter((part) => source === 'both' || source === part)
              .map((part, index) => (
                <section
                  key={part}
                  aria-label={part === 'internal' ? 'Internal fulfillment' : 'External fulfillment'}
                  className={cn('min-w-0', index > 0 && 'border-t border-mode-fact')}
                  data-testid={`fulfillment-source-${part}`}
                >
                  {part === 'internal' ? internal : external}
                </section>
              ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
