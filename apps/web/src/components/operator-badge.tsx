'use client';

import { Check, RadioTower } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Brand colour + short mark for a recharge operator. A monogram, not the operator's logo. */
type Mark = { text: string; bg: string; fg?: string };

const MARKS: Record<string, Mark> = {
  AIRTEL: { text: 'A', bg: '#E40000' },
  JIO: { text: 'Jio', bg: '#0A2885' },
  VI: { text: 'Vi', bg: '#EE1C25', fg: '#FFE600' },
  BSNL: { text: 'B', bg: '#1B6EB5' },
  MTNL: { text: 'M', bg: '#1B4F9C' },
  TATA_PLAY: { text: 'TP', bg: '#8E1F7C' },
  DISH_TV: { text: 'D', bg: '#E5451F' },
  AIRTEL_DTH: { text: 'A', bg: '#B80000' },
  SUN_DIRECT: { text: 'S', bg: '#F08A00' },
  D2H: { text: 'd2h', bg: '#D71F26' },
};
const FALLBACK = '#64748B';

/** Resolves an operator from a registry code (`TATA_PLAY`) or a provider name ("Airtel Digital TV"). */
export function operatorMark(codeOrName: string): Mark {
  const up = codeOrName.trim().toUpperCase();
  if (MARKS[up]) return MARKS[up];
  const n = up.replace(/[^A-Z0-9]/g, '');
  if (!n || n === 'OTHER') return { text: '', bg: FALLBACK };
  let code: string | null = null;
  if (n.includes('AIRTEL')) code = /DTH|DIGITAL|TV/.test(n) ? 'AIRTEL_DTH' : 'AIRTEL';
  else if (n.includes('JIO')) code = 'JIO';
  else if (n.includes('D2H') || n.includes('VIDEOCON'))
    code = 'D2H'; // before Vi: "Videocon" starts with VI
  else if (n.startsWith('VI') || n.includes('VODAFONE') || n.includes('IDEA')) code = 'VI';
  else if (n.includes('BSNL')) code = 'BSNL';
  else if (n.includes('MTNL')) code = 'MTNL';
  else if (n.includes('TATA')) code = 'TATA_PLAY';
  else if (n.includes('DISH')) code = 'DISH_TV';
  else if (n.includes('SUN')) code = 'SUN_DIRECT';
  return code ? MARKS[code]! : { text: n[0]!, bg: FALLBACK };
}

export function OperatorBadge({ operator, size = 32 }: { operator: string; size?: number }) {
  const m = operatorMark(operator);
  const len = m.text.length;
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-extrabold leading-none tracking-tight"
      style={{
        width: size,
        height: size,
        background: m.bg,
        color: m.fg ?? '#fff',
        fontSize: size * (len >= 3 ? 0.32 : len === 2 ? 0.38 : 0.46),
      }}
    >
      {m.text || <RadioTower style={{ width: size * 0.5, height: size * 0.5 }} />}
    </span>
  );
}

/** Operator chooser: a radio grid of tiles with the brand badge and name. */
export function OperatorTiles({
  value,
  options,
  onChange,
  id,
  label,
  invalid,
  describedBy,
}: {
  value: string;
  options: { value: string; label: string; mark?: string }[];
  onChange: (v: string) => void;
  id?: string;
  label: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div
      id={id}
      role="radiogroup"
      tabIndex={-1}
      aria-label={label}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      data-section-error={invalid ? 'true' : undefined}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex min-h-12 items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition focus-visible:ring-3 focus-visible:ring-focus/30 focus-visible:outline-none',
              on
                ? 'border-brand bg-brand-bg text-fg'
                : invalid
                  ? 'border-danger/60 bg-surface hover:border-brand/40'
                  : 'border-border bg-surface hover:border-brand/40 hover:bg-surface-muted/50',
            )}
          >
            <OperatorBadge operator={o.mark ?? o.value} size={30} />
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {on ? <Check aria-hidden className="size-4 shrink-0 text-brand" /> : null}
          </button>
        );
      })}
    </div>
  );
}
