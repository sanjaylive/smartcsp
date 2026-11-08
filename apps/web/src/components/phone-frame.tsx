'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  Bell,
  BookOpen,
  ClipboardList,
  HandCoins,
  House,
  Landmark,
  Plus,
  Smartphone,
  TrendingUp,
  WalletMinimal,
  Zap,
} from 'lucide-react';
import { useBrand } from '@/lib/brand';
import { CountUp, prefersReducedMotion } from '@/components/landing-motion';

/* ----------------------------------------------------------------- Device frame */

/**
 * A modern full-screen phone (titanium edge, black bezel, Dynamic Island, side buttons, home
 * indicator). Pure CSS, so it scales crisply and the screen content stays real, live HTML.
 */
export function IPhoneFrame({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const btn =
    'absolute w-[3px] rounded-full bg-gradient-to-b from-[#5a5a5f] via-[#9a9aa0] to-[#4a4a4f]';
  return (
    <div className={`relative ${className}`} style={{ aspectRatio: '300 / 618' }}>
      {/* side buttons */}
      <span aria-hidden className={`${btn} -left-[2px] top-[17%] h-[4.5%]`} />
      <span aria-hidden className={`${btn} -left-[2px] top-[25%] h-[8.5%]`} />
      <span aria-hidden className={`${btn} -left-[2px] top-[35.5%] h-[8.5%]`} />
      <span aria-hidden className={`${btn} -right-[2px] top-[28%] h-[13%]`} />

      {/* titanium edge */}
      <div className="absolute inset-0 rounded-[3.3rem] bg-gradient-to-br from-[#8e8e93] via-[#3a3a3c] to-[#6e6e73] p-[3px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.45),0_18px_36px_-18px_rgba(0,0,0,0.35)]">
        {/* black bezel */}
        <div className="relative h-full w-full rounded-[3.1rem] bg-[#0b0b0c] p-[11px] ring-1 ring-white/10">
          {/* screen */}
          <div className="relative h-full w-full overflow-hidden rounded-[2.5rem] bg-bg">
            {/* Dynamic Island */}
            <div
              aria-hidden
              className="absolute left-1/2 top-[10px] z-30 flex h-[26px] w-[92px] -translate-x-1/2 items-center justify-end rounded-full bg-black pr-3"
            >
              <span className="size-[9px] rounded-full bg-[#1a1d2b] ring-1 ring-[#2a2f45]" />
            </div>

            <div className="flex h-full flex-col">
              <StatusBar />
              <div className="relative min-h-0 flex-1">{children}</div>
            </div>

            {/* home indicator */}
            <div
              aria-hidden
              className="absolute bottom-[7px] left-1/2 z-30 h-[4px] w-[34%] -translate-x-1/2 rounded-full bg-fg/80"
            />

            {/* glass glare */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-40 bg-[linear-gradient(115deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0.04)_28%,transparent_42%)]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="flex h-[46px] shrink-0 items-center justify-between px-7 pt-1 text-[13px] font-semibold text-fg">
      <span className="money">9:41</span>
      <span className="flex items-center gap-[5px]" aria-hidden>
        {/* signal */}
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
          <rect x="0" y="7" width="3" height="4" rx="1" />
          <rect x="4.5" y="5" width="3" height="6" rx="1" />
          <rect x="9" y="2.5" width="3" height="8.5" rx="1" />
          <rect x="13.5" y="0" width="3" height="11" rx="1" />
        </svg>
        {/* wifi */}
        <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor">
          <path d="M7.5 2.2c2.1 0 4 .8 5.5 2.1l1.1-1.2A9.6 9.6 0 0 0 7.5.6 9.6 9.6 0 0 0 .9 3.1L2 4.3a8 8 0 0 1 5.5-2.1Z" />
          <path d="M7.5 5.4c1.2 0 2.3.4 3.2 1.2l1.1-1.2A6.4 6.4 0 0 0 7.5 3.8c-1.6 0-3.1.6-4.3 1.6l1.1 1.2c.9-.8 2-1.2 3.2-1.2Z" />
          <path d="M7.5 8.4 9.4 6.9a3 3 0 0 0-3.8 0Z" transform="translate(0 1.4)" />
        </svg>
        {/* battery */}
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none">
          <rect x=".5" y=".5" width="22" height="11" rx="3.2" stroke="currentColor" opacity=".4" />
          <rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor" />
          <path d="M24 4v4a2 2 0 0 0 0-4Z" fill="currentColor" opacity=".45" />
        </svg>
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------- App screen shown inside */

const ENTRIES = [
  { svc: 'AEPS', who: 'Geeta Devi', amt: '₹5,000', fee: '+₹25', icon: Landmark },
  { svc: 'DMT', who: 'Ramesh Kumar', amt: '₹2,500', fee: '+₹30', icon: TrendingUp },
  { svc: 'PAN', who: 'Sita Sharma', amt: '₹107', fee: '+₹50', icon: ClipboardList },
  { svc: 'Recharge', who: 'Anil Yadav', amt: '₹299', fee: '+₹6', icon: Smartphone },
  { svc: 'Bill', who: 'Rahul Verma', amt: '₹1,420', fee: '+₹15', icon: Zap },
  { svc: 'AEPS', who: 'Sunita Kumari', amt: '₹3,000', fee: '+₹15', icon: Landmark },
] as const;

/** A live, self-updating home screen of the counter app. */
export function PhoneAppScreen() {
  const brand = useBrand();
  const [rows, setRows] = useState(() => ENTRIES.slice(0, 4).map((e, i) => ({ ...e, id: 3 - i })));
  const [served, setServed] = useState(42);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = setInterval(() => {
      setServed((n) => n + 1);
      setRows((r) => {
        const id = r[0]!.id + 1;
        return [{ ...ENTRIES[id % ENTRIES.length]!, id }, ...r].slice(0, 4);
      });
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  const actions = [
    { label: 'AEPS', icon: Landmark },
    { label: 'DMT', icon: TrendingUp },
    { label: 'PAN', icon: ClipboardList },
    { label: 'Bills', icon: Zap },
  ];
  const tabs = [
    { label: 'Home', icon: House, active: true },
    { label: 'Records', icon: ClipboardList },
    { label: 'Khata', icon: HandCoins },
    { label: 'Cashbook', icon: BookOpen },
  ];

  return (
    <div className="flex h-full flex-col text-fg">
      {/* app bar */}
      <div className="flex items-center justify-between px-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-brand text-on-brand">
            <WalletMinimal className="size-4" />
          </span>
          <div className="leading-tight">
            <p className="text-[10px] font-medium text-fg-muted">Namaste, Ravi</p>
            <p className="font-display text-[13px] font-extrabold">{brand.name}</p>
          </div>
        </div>
        <span className="relative grid size-8 place-items-center rounded-full bg-surface shadow-sm">
          <Bell className="size-4" />
          <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-brand" />
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-4">
        {/* summary card */}
        <div className="relative overflow-hidden rounded-2xl bg-brand p-3.5 text-on-brand">
          <span aria-hidden className="absolute -right-6 -top-8 size-24 rounded-full bg-white/10" />
          <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">
            Today&apos;s fees
          </p>
          <p className="font-display text-[26px] font-extrabold leading-tight">
            <CountUp to={840} prefix="₹" />
          </p>
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold opacity-90">
            <span className="whitespace-nowrap">{served} served today</span>
            <span className="whitespace-nowrap rounded-full bg-white/20 px-2 py-0.5">
              Drawer ₹11,320
            </span>
          </div>
        </div>

        {/* quick actions */}
        <div className="grid grid-cols-4 gap-2">
          {actions.map(({ label, icon: Icon }) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <span className="grid size-10 place-items-center rounded-xl bg-surface text-brand shadow-sm">
                <Icon className="size-[18px]" />
              </span>
              <span className="text-[9.5px] font-semibold text-fg-muted">{label}</span>
            </div>
          ))}
        </div>

        {/* recent */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-bold">Recent</p>
            <span className="flex items-center gap-1 text-[9.5px] font-semibold text-emerald-600">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
            </span>
          </div>
          <ul className="space-y-1.5">
            {rows.map((r, i) => {
              const Icon = r.icon;
              return (
                <li
                  key={r.id}
                  className={`flex items-center gap-2.5 rounded-xl bg-surface px-2.5 py-2 shadow-sm ${
                    i === 0 && r.id > 3 ? 'animate-feed-in' : ''
                  }`}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-bg text-brand">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[11px] font-bold">{r.who}</span>
                    <span className="text-[9.5px] text-fg-muted">{r.svc}</span>
                  </span>
                  <span className="text-right leading-tight">
                    <span className="money block text-[11px] font-extrabold">{r.amt}</span>
                    <span className="text-[9.5px] font-semibold text-emerald-600">{r.fee}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* floating add button + tab bar */}
      <div className="relative shrink-0 border-t border-border/70 bg-surface px-3 pb-5 pt-1.5">
        <span className="absolute -top-6 right-4 grid size-11 place-items-center rounded-full bg-brand text-on-brand shadow-lg shadow-brand/30">
          <Plus className="size-5" />
        </span>
        <div className="grid grid-cols-4">
          {tabs.map(({ label, icon: Icon, active }) => (
            <span
              key={label}
              className={`flex flex-col items-center gap-0.5 text-[9px] font-semibold ${active ? 'text-brand' : 'text-fg-muted'}`}
            >
              <Icon className="size-[17px]" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
