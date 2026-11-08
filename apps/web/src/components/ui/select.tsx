'use client';

/*
 * Drop-in replacement for a native <select>: same props (`value`, `onChange(e) => e.target.value`,
 * `<option>` children), rendered as an accessible combobox with type-to-search. Lists longer than
 * SEARCH_MIN options get a search box. Built on Radix Popover so it layers correctly inside
 * dialogs and drawers.
 */

import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/cn';

const SEARCH_MIN = 6;

interface Opt {
  value: string;
  label: string;
  disabled: boolean;
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

function collect(children: ReactNode, out: Opt[] = []): Opt[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ children?: ReactNode; value?: unknown; disabled?: boolean }>;
    if (el.type === Fragment || el.type === 'optgroup') collect(el.props.children, out);
    else if (el.type === 'option') {
      const label = textOf(el.props.children);
      out.push({
        value: el.props.value === undefined ? label : String(el.props.value),
        label,
        disabled: !!el.props.disabled,
      });
    }
  });
  return out;
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  /** Force the search box on/off; default is on when there are more than 6 options. */
  searchable?: boolean;
  placeholder?: string;
};

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    className,
    children,
    value,
    defaultValue,
    onChange,
    disabled,
    id,
    searchable,
    placeholder,
    autoFocus,
    'aria-describedby': describedBy,
    'aria-invalid': ariaInvalid,
    'aria-label': ariaLabel,
    'aria-labelledby': labelledBy,
    required,
  },
  ref,
) {
  const options = useMemo(() => collect(children), [children]);
  const [inner, setInner] = useState(String(defaultValue ?? options[0]?.value ?? ''));
  const current = value !== undefined ? String(value) : inner;
  const selected = options.find((o) => o.value === current);

  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const showSearch = searchable ?? options.length > SEARCH_MIN;

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, term]);

  useEffect(() => {
    if (!open) return;
    setTerm('');
    const i = options.findIndex((o) => o.value === current);
    setActive(i >= 0 ? i : 0);
    // Render inside an open dialog/drawer so its focus trap allows typing in the search box.
    setContainer((triggerRef.current?.closest('[role="dialog"]') as HTMLElement | null) ?? null);
  }, [open, options, current]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (o: Opt) => {
    if (o.disabled) return;
    if (value === undefined) setInner(o.value);
    onChange?.({
      target: { value: o.value },
      currentTarget: { value: o.value },
    } as unknown as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const move = (delta: number) => {
    if (!filtered.length) return;
    let i = active;
    for (let n = 0; n < filtered.length; n++) {
      i = (i + delta + filtered.length) % filtered.length;
      if (!filtered[i]!.disabled) break;
    }
    setActive(i);
  };

  const onListKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(filtered.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = filtered[active];
      if (o) choose(o);
    } else if (e.key === 'Tab') setOpen(false);
  };

  const optionId = (i: number) => `${listId}-o${i}`;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          ref={(el) => {
            triggerRef.current = el;
            if (typeof ref === 'function') ref(el);
            else if (ref) ref.current = el;
          }}
          id={id}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-describedby={describedBy}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          aria-required={required || undefined}
          autoFocus={autoFocus}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className={cn(
            'flex w-full min-h-10 items-center justify-between gap-2 rounded-[10px] border border-border bg-surface px-3 text-left text-base text-fg transition sm:text-sm',
            'hover:border-fg-muted/40 focus:border-brand focus:outline-none focus:ring-3 focus:ring-focus/30',
            'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70 aria-[invalid=true]:border-danger',
            open && 'border-brand ring-3 ring-focus/20',
            className,
          )}
        >
          <span className={cn('truncate', (!selected || selected.value === '') && 'text-fg-muted')}>
            {selected?.label || placeholder || ' '}
          </span>
          <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-fg-muted" />
        </button>
      </Popover.Trigger>

      <Popover.Portal container={container ?? undefined}>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (showSearch ? searchRef.current : listRef.current)?.focus();
          }}
          className="z-[70] w-[var(--radix-popover-trigger-width)] min-w-52 overflow-hidden rounded-xl border border-border bg-surface shadow-xl outline-none animate-[so-rise_.14s_ease-out]"
        >
          {showSearch && (
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search aria-hidden className="size-4 shrink-0 text-fg-muted" />
              <input
                ref={searchRef}
                value={term}
                onChange={(e) => {
                  setTerm(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onListKey}
                placeholder="Search…"
                aria-label="Search options"
                aria-controls={listId}
                aria-activedescendant={filtered.length ? optionId(active) : undefined}
                className="h-10 w-full bg-transparent text-base text-fg outline-none placeholder:text-fg-muted sm:text-sm"
              />
            </div>
          )}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={showSearch ? -1 : 0}
            aria-activedescendant={!showSearch && filtered.length ? optionId(active) : undefined}
            onKeyDown={showSearch ? undefined : onListKey}
            className="max-h-64 overflow-y-auto p-1 outline-none"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-fg-muted">No matches</li>
            ) : (
              filtered.map((o, i) => {
                const isSel = o.value === current;
                return (
                  <li
                    key={o.value + i}
                    id={optionId(i)}
                    data-index={i}
                    role="option"
                    aria-selected={isSel}
                    aria-disabled={o.disabled || undefined}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                    className={cn(
                      'flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-sm',
                      i === active && 'bg-surface-muted',
                      isSel && 'font-semibold text-brand',
                      o.disabled && 'cursor-not-allowed opacity-45',
                      o.value === '' && !isSel && 'text-fg-muted',
                    )}
                  >
                    <span className="flex-1 truncate">{o.label}</span>
                    {isSel && <Check aria-hidden className="size-4 shrink-0" />}
                  </li>
                );
              })
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});
