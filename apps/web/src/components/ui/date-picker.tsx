'use client';

/*
 * Drop-in replacement for <input type="date">: same `value` ("YYYY-MM-DD"), `min`, `max` and
 * `onChange(e) => e.target.value` contract, rendered as a branded calendar popover.
 * Dates are handled as plain year/month/day numbers, so there are no timezone surprises.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import * as Popover from '@radix-ui/react-popover';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/cn';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface Ymd {
  y: number;
  m: number; // 0-11
  d: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (v: Ymd) => `${v.y}-${pad(v.m + 1)}-${pad(v.d)}`;
function parse(s: string | undefined | null): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  return m ? { y: +m[1]!, m: +m[2]! - 1, d: +m[3]! } : null;
}
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
function addDays(v: Ymd, n: number): Ymd {
  const dt = new Date(v.y, v.m, v.d + n);
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
}
function addMonths(v: Ymd, n: number): Ymd {
  const first = new Date(v.y, v.m + n, 1);
  const y = first.getFullYear();
  const m = first.getMonth();
  return { y, m, d: Math.min(v.d, daysIn(y, m)) };
}
function todayYmd(): Ymd {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
}
export function formatPretty(s: string) {
  const v = parse(s);
  return v ? `${pad(v.d)} ${MONTHS[v.m]!.slice(0, 3)} ${v.y}` : '';
}

export type DatePickerProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  | 'id'
  | 'min'
  | 'max'
  | 'disabled'
  | 'required'
  | 'className'
  | 'placeholder'
  | 'aria-describedby'
  | 'aria-invalid'
  | 'aria-label'
  | 'name'
  | 'autoFocus'
> & {
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
};

export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  disabled,
  required,
  className,
  placeholder = 'Pick a date',
  autoFocus,
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const selected = parse(value);
  const minV = parse(min as string | undefined);
  const maxV = parse(max as string | undefined);
  const today = useMemo(todayYmd, []);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'days' | 'months'>('days');
  const [focus, setFocus] = useState<Ymd>(selected ?? today);
  const gridRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  const cmp = (a: Ymd, b: Ymd) => toIso(a).localeCompare(toIso(b));
  const outOfRange = (v: Ymd) => (!!minV && cmp(v, minV) < 0) || (!!maxV && cmp(v, maxV) > 0);
  const same = (a: Ymd | null, b: Ymd) => !!a && a.y === b.y && a.m === b.m && a.d === b.d;

  useEffect(() => {
    if (!open) return;
    setView('days');
    setFocus(selected ?? (maxV && cmp(today, maxV) > 0 ? maxV : today));
    // Inside a dialog/drawer, render there so its focus trap allows keyboard use.
    setContainer((triggerRef.current?.closest('[role="dialog"]') as HTMLElement | null) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep keyboard focus on the focused day as it moves.
  useEffect(() => {
    if (open && view === 'days')
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${toIso(focus)}"]`)?.focus();
  }, [focus, open, view]);

  const emit = (iso: string) => {
    onChange?.({
      target: { value: iso },
      currentTarget: { value: iso },
    } as unknown as ChangeEvent<HTMLInputElement>);
  };
  const choose = (v: Ymd) => {
    if (outOfRange(v)) return;
    emit(toIso(v));
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onGridKey = (e: KeyboardEvent) => {
    const moves: Record<string, () => Ymd> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, -1),
      PageDown: () => addMonths(focus, 1),
      Home: () => addDays(focus, -new Date(focus.y, focus.m, focus.d).getDay()),
      End: () => addDays(focus, 6 - new Date(focus.y, focus.m, focus.d).getDay()),
    };
    const fn = moves[e.key];
    if (fn) {
      e.preventDefault();
      setFocus(fn());
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(focus);
    }
  };

  // 6-week grid starting on the Sunday on/before the 1st.
  const first = new Date(focus.y, focus.m, 1);
  const start = addDays({ y: focus.y, m: focus.m, d: 1 }, -first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const yesterday = addDays(today, -1);
  const quick = [
    { label: 'Today', v: today },
    { label: 'Yesterday', v: yesterday },
  ].filter((q) => !outOfRange(q.v));
  const years = Array.from({ length: 12 }, (_, i) => focus.y - 6 + i);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-describedby={describedBy}
          data-invalid={ariaInvalid === true || ariaInvalid === 'true' ? 'true' : undefined}
          aria-label={ariaLabel}
          autoFocus={autoFocus}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className={cn(
            'flex w-full min-h-10 items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-left text-base text-fg transition sm:text-sm',
            'hover:border-fg-muted/40 focus:border-brand focus:outline-none focus:ring-3 focus:ring-focus/30',
            'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70 data-[invalid=true]:border-danger',
            open && 'border-brand ring-3 ring-focus/20',
            className,
          )}
        >
          <CalendarDays
            aria-hidden
            className={cn('size-4 shrink-0', selected ? 'text-brand' : 'text-fg-muted')}
          />
          <span className={cn('money flex-1 truncate', !selected && 'text-fg-muted')}>
            {selected ? formatPretty(value!) : placeholder}
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Portal container={container ?? undefined}>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          aria-label="Choose date"
          onOpenAutoFocus={(e) => {
            // Start keyboard users on the selected (or today's) day.
            e.preventDefault();
            (e.currentTarget as HTMLElement)
              .querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')
              ?.focus();
          }}
          className="z-[70] w-[18.5rem] rounded-2xl border border-border bg-surface p-3 shadow-xl outline-none animate-[so-rise_.14s_ease-out]"
        >
          {/* header */}
          <div className="mb-2 flex items-center justify-between gap-1">
            <button
              type="button"
              aria-label={view === 'days' ? 'Previous month' : 'Earlier years'}
              onClick={() =>
                setFocus((f) => (view === 'days' ? addMonths(f, -1) : addMonths(f, -12)))
              }
              className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted hover:text-fg"
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setView((v) => (v === 'days' ? 'months' : 'days'))}
              aria-label={view === 'days' ? 'Choose month and year' : 'Back to days'}
              className="rounded-lg px-2.5 py-1 font-display text-sm font-bold hover:bg-surface-muted"
            >
              {view === 'days' ? `${MONTHS[focus.m]} ${focus.y}` : focus.y}
            </button>
            <button
              type="button"
              aria-label={view === 'days' ? 'Next month' : 'Later years'}
              onClick={() =>
                setFocus((f) => (view === 'days' ? addMonths(f, 1) : addMonths(f, 12)))
              }
              className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted hover:text-fg"
            >
              <ChevronRight aria-hidden className="size-4" />
            </button>
          </div>

          {view === 'days' ? (
            <>
              <div
                className="grid grid-cols-7 text-center text-[11px] font-semibold text-fg-muted"
                aria-hidden
              >
                {WEEKDAYS.map((w) => (
                  <span key={w} className="py-1">
                    {w}
                  </span>
                ))}
              </div>
              <div
                ref={gridRef}
                role="grid"
                aria-label={`${MONTHS[focus.m]} ${focus.y}`}
                onKeyDown={onGridKey}
                className="grid grid-cols-7 gap-0.5"
              >
                {cells.map((c) => {
                  const iso = toIso(c);
                  const inMonth = c.m === focus.m;
                  const isSel = same(selected, c);
                  const isToday = same(today, c);
                  const off = outOfRange(c);
                  const isFocus = same(focus, c);
                  return (
                    <button
                      key={iso}
                      type="button"
                      role="gridcell"
                      data-iso={iso}
                      tabIndex={isFocus ? 0 : -1}
                      aria-selected={isSel}
                      aria-current={isToday ? 'date' : undefined}
                      aria-disabled={off || undefined}
                      aria-label={`${c.d} ${MONTHS[c.m]} ${c.y}`}
                      onClick={() => choose(c)}
                      className={cn(
                        'money relative grid h-9 place-items-center rounded-lg text-sm transition-colors outline-none',
                        !inMonth && 'text-fg-muted/50',
                        off
                          ? 'cursor-not-allowed text-fg-muted/30'
                          : 'hover:bg-brand-bg hover:text-brand',
                        isToday && !isSel && 'font-bold text-brand ring-1 ring-brand/40 ring-inset',
                        isSel &&
                          'bg-brand font-bold text-on-brand hover:bg-brand-strong hover:text-on-brand',
                        isFocus && !isSel && 'focus-visible:ring-2 focus-visible:ring-focus',
                        isFocus &&
                          isSel &&
                          'focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1',
                      )}
                    >
                      {c.d}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-1">
                {MONTHS.map((name, i) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setFocus((f) => ({ y: f.y, m: i, d: Math.min(f.d, daysIn(f.y, i)) }));
                      setView('days');
                    }}
                    className={cn(
                      'rounded-lg py-2 text-sm font-medium hover:bg-brand-bg hover:text-brand',
                      i === focus.m && 'bg-brand-bg font-bold text-brand',
                    )}
                  >
                    {name.slice(0, 3)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-1 border-t border-border pt-3">
                {years.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() =>
                      setFocus((f) => ({ y, m: f.m, d: Math.min(f.d, daysIn(y, f.m)) }))
                    }
                    className={cn(
                      'money rounded-lg py-1.5 text-sm hover:bg-brand-bg hover:text-brand',
                      y === focus.y &&
                        'bg-brand text-on-brand hover:bg-brand-strong hover:text-on-brand',
                    )}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* footer */}
          <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => choose(q.v)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-semibold transition',
                  same(selected, q.v)
                    ? 'border-brand bg-brand-bg text-brand'
                    : 'border-border text-fg-muted hover:border-brand/40 hover:text-fg',
                )}
              >
                {q.label}
              </button>
            ))}
            {!required && selected ? (
              <button
                type="button"
                onClick={() => {
                  emit('');
                  setOpen(false);
                }}
                className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-fg-muted hover:text-danger"
              >
                <X aria-hidden className="size-3" /> Clear
              </button>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
