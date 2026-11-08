'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardList,
  HandCoins,
  History,
  Landmark,
  Layers,
  Lock,
  Minus,
  MessageSquare,
  Play,
  Plus,
  Printer,
  ReceiptIndianRupee,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  Zap,
  Smartphone,
  WifiOff,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useBrand } from '@/lib/brand';
import { MarketingShell } from '@/components/marketing-chrome';
import { BankArt, CscArt, HeroIllustration, ShopArt } from '@/components/landing-art';
import { CountUp, Reveal, prefersReducedMotion } from '@/components/landing-motion';
import { IPhoneFrame, PhoneAppScreen } from '@/components/phone-frame';

/* ----------------------------------------------------------------- Hero Section */

function Hero() {
  const { t } = useI18n();

  return (
    <section className="relative overflow-hidden border-b border-border/60 pb-16 pt-10 lg:pb-24 lg:pt-16">
      <div className="bg-grid absolute inset-0 opacity-40" aria-hidden />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:px-8">
        {/* Copy */}
        <div className="text-center lg:text-left">
          <div className="animate-rise inline-flex items-center gap-2 rounded-full border border-brand/30 bg-surface px-4 py-1.5 shadow-sm">
            <span className="flex size-2 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-xs font-bold text-fg">{t('landing.hero.badge')}</span>
            <span className="mx-1 text-fg-muted">·</span>
            <span className="text-xs font-semibold text-brand">100% Offline Ready</span>
          </div>

          <h1
            className="animate-rise mt-6 font-display text-4xl font-extrabold tracking-tight text-fg sm:text-5xl lg:text-[3.4rem] lg:leading-[1.1]"
            style={{ animationDelay: '80ms' }}
          >
            {t('landing.hero.title')}{' '}
            <span className="relative text-brand">
              {t('landing.hero.titleEm')}
              <svg
                aria-hidden
                viewBox="0 0 200 12"
                preserveAspectRatio="none"
                className="absolute -bottom-2 left-0 h-3 w-full text-brand/40"
              >
                <path
                  d="M2 9 Q 100 -2 198 7"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>
          <p
            className="animate-rise mx-auto mt-6 max-w-xl text-lg text-fg-muted sm:text-xl sm:leading-relaxed lg:mx-0"
            style={{ animationDelay: '160ms' }}
          >
            {t('landing.hero.sub')}
          </p>

          <div
            className="animate-rise mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4 lg:justify-start"
            style={{ animationDelay: '240ms' }}
          >
            <Link
              href="/register"
              className="group inline-flex min-h-13 items-center justify-center gap-2.5 rounded-xl bg-brand px-7 text-base font-bold text-on-brand shadow-lg shadow-brand/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-strong active:translate-y-0"
            >
              <span>{t('landing.cta.create')}</span>
              <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#simulator"
              className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 text-base font-bold text-fg shadow-sm transition-all duration-200 hover:border-brand/40"
            >
              <Play className="size-4 fill-brand text-brand" />
              <span>{t('landing.seeHow')}</span>
            </a>
          </div>

          <div
            className="animate-rise mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-semibold text-fg-muted lg:justify-start"
            style={{ animationDelay: '320ms' }}
          >
            {['2-minute setup, no documents', 'Aadhaar auto-masked', 'Works 100% offline'].map(
              (x) => (
                <span key={x} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  {x}
                </span>
              ),
            )}
          </div>
        </div>

        {/* Illustration with floating, popping cards */}
        <div className="relative mx-auto w-full max-w-xl">
          <HeroIllustration className="animate-rise h-auto w-full" />

          <div
            className="animate-pop absolute left-0 top-[18%] sm:-left-4"
            style={{ animationDelay: '700ms' }}
          >
            <div className="animate-float flex items-center gap-2.5 rounded-xl border border-border bg-surface p-2.5 pr-4 shadow-xl">
              <span className="grid size-9 place-items-center rounded-lg bg-brand-bg text-brand">
                <Landmark className="size-5" />
              </span>
              <div>
                <p className="text-xs font-bold text-fg">AEPS ₹5,000 saved</p>
                <p className="text-[11px] text-fg-muted">in 3 seconds</p>
              </div>
            </div>
          </div>

          <div
            className="animate-pop absolute bottom-[10%] right-0 sm:-right-4"
            style={{ animationDelay: '1100ms' }}
          >
            <div
              className="animate-float flex items-center gap-2.5 rounded-xl border border-border bg-surface p-2.5 pr-4 shadow-xl"
              style={{ animationDelay: '1.5s' }}
            >
              <span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/70 dark:text-emerald-400">
                <MessageSquare className="size-5" />
              </span>
              <div>
                <p className="text-xs font-bold text-fg">WhatsApp receipt sent</p>
                <p className="text-[11px] text-fg-muted">to Geeta Devi ✓✓</p>
              </div>
            </div>
          </div>

          <div
            className="animate-pop absolute right-[6%] top-0 hidden sm:block"
            style={{ animationDelay: '1500ms' }}
          >
            <div
              className="animate-float rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-bold text-emerald-700 shadow-lg dark:text-emerald-400"
              style={{ animationDelay: '.8s' }}
            >
              ● Drawer balanced · ₹0 gap
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Live counter section */

function LiveCounter() {
  return (
    <section className="border-b border-border/60 py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-brand">Live counter</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            Every customer, recorded the moment you serve them
          </h2>
          <p className="mt-3 text-lg text-fg-muted">
            Fees, cash in the drawer and pending dues update on their own while you work.
          </p>
        </Reveal>
        <Reveal delay={120} className="relative mx-auto mt-12 max-w-5xl">
          <HeroWindowPreview />
        </Reveal>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Pro Hero Window Preview */

function HeroWindowPreview() {
  const { t } = useI18n();
  const brand = useBrand();

  const stats = [
    {
      label: t('landing.mock.collections'),
      amount: '₹24,850',
      badge: '+18.4%',
      tone: 'success',
      sub: "Today's Volume",
    },
    {
      label: t('landing.mock.cashInHand'),
      amount: '₹11,320',
      badge: 'Balanced',
      tone: 'success',
      sub: 'Exact Drawer Match',
    },
    {
      label: t('landing.mock.pendingDues'),
      amount: '₹650',
      badge: '2 Pending',
      tone: 'warning',
      sub: 'Customer Khata',
    },
    {
      label: 'Net Commission',
      amount: '₹840',
      badge: 'Auto-Tracked',
      tone: 'info',
      sub: 'Earned Today',
    },
  ];

  const pool = [
    {
      svc: t('landing.mock.aeps'),
      icon: Landmark,
      who: 'Geeta Devi',
      time: '10:42 AM',
      amount: '₹5,000',
      fee: '+₹25',
      cashDelta: '− ₹5,000 cash',
      status: 'success',
    },
    {
      svc: t('landing.mock.dmt'),
      icon: TrendingUp,
      who: 'Ramesh Kumar',
      time: '11:15 AM',
      amount: '₹2,500',
      fee: '+₹30',
      cashDelta: '+ ₹2,530 cash',
      status: 'success',
    },
    {
      svc: t('landing.mock.pan'),
      icon: ClipboardList,
      who: 'Sita Sharma',
      time: '11:48 AM',
      amount: '₹107',
      fee: '+₹50',
      cashDelta: '₹0 (Pending Due)',
      status: 'warning',
    },
    {
      svc: 'Electricity Bill',
      icon: Zap,
      who: 'Rahul Verma',
      time: '12:05 PM',
      amount: '₹1,420',
      fee: '+₹15',
      cashDelta: '+ ₹1,435 cash',
      status: 'success',
    },
    {
      svc: 'Mobile Recharge',
      icon: Smartphone,
      who: 'Anil Yadav',
      time: '12:20 PM',
      amount: '₹299',
      fee: '+₹6',
      cashDelta: '+ ₹305 cash',
      status: 'success',
    },
    {
      svc: t('landing.mock.aeps'),
      icon: Landmark,
      who: 'Sunita Kumari',
      time: '12:34 PM',
      amount: '₹3,000',
      fee: '+₹15',
      cashDelta: '− ₹3,000 cash',
      status: 'success',
    },
    {
      svc: 'Aadhaar Update',
      icon: ClipboardList,
      who: 'Mohan Lal',
      time: '12:51 PM',
      amount: '₹100',
      fee: '+₹50',
      cashDelta: '₹0 (Pending Due)',
      status: 'warning',
    },
    {
      svc: t('landing.mock.dmt'),
      icon: TrendingUp,
      who: 'Kavita Singh',
      time: '1:08 PM',
      amount: '₹4,000',
      fee: '+₹40',
      cashDelta: '+ ₹4,040 cash',
      status: 'success',
    },
  ];

  const [feed, setFeed] = useState(() => pool.slice(0, 4).map((tx, i) => ({ ...tx, id: 3 - i })));
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = setInterval(() => {
      setCount((c) => c + 1);
      setFeed((rows) => {
        const next = pool[(rows[0].id + 1) % pool.length]!;
        return [{ ...next, id: rows[0].id + 1 }, ...rows].slice(0, 4);
      });
    }, 2800);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      {/* Main Window */}
      <div className="pro-window relative overflow-hidden bg-surface">
        {/* Window Chrome Titlebar */}
        <div className="flex items-center justify-between border-b border-border/80 bg-surface-muted/60 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-red-400" />
            <span className="size-3 rounded-full bg-amber-400" />
            <span className="size-3 rounded-full bg-emerald-400" />
            <div className="ml-3 hidden items-center gap-2 rounded-lg border border-border/80 bg-surface px-3 py-1 text-xs font-semibold text-fg-muted sm:flex">
              <Lock className="size-3 text-emerald-600" />
              <span>https://{brand.name.toLowerCase().replace(/\s+/g, '')}.app/counter</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-ping" />
              {t('landing.mock.synced')}
            </span>
            <span className="text-xs font-semibold text-fg-muted">Shift 1 · 07 Nov</span>
          </div>
        </div>

        {/* Dashboard Top Metric Cards */}
        <div className="grid grid-cols-2 gap-3 border-b border-border/80 bg-bg/40 p-4 sm:grid-cols-4 sm:gap-4 sm:p-5">
          {stats.map((s) => (
            <div
              key={s.label}
              className="group rounded-xl border border-border/80 bg-surface p-3.5 shadow-sm transition hover:border-brand/40 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                  {s.label}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    s.tone === 'success'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                      : s.tone === 'warning'
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                        : 'bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-400'
                  }`}
                >
                  {s.badge}
                </span>
              </div>
              <p className="mt-1 font-display text-xl font-extrabold tracking-tight text-fg sm:text-2xl">
                {s.amount}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-fg-muted">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Live Transaction Ledger Table */}
        <div className="p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-brand animate-pulse" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-fg-muted">
                {t('landing.mock.recent')} · {42 + count} today
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-brand">
              <span>Auto-balancing active</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/80 bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-surface-muted/50 text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                  <th className="px-3.5 py-2.5">Service</th>
                  <th className="px-3.5 py-2.5">Customer</th>
                  <th className="px-3.5 py-2.5 text-right">Amount</th>
                  <th className="hidden px-3.5 py-2.5 text-right sm:table-cell">Drawer Impact</th>
                  <th className="px-3.5 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {feed.map((tx, i) => {
                  const Icon = tx.icon;
                  return (
                    <tr
                      key={tx.id}
                      className={`transition-colors hover:bg-surface-muted/30 ${i === 0 && count > 0 ? 'animate-feed-in' : ''}`}
                    >
                      <td className="px-3.5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-bg text-brand">
                            <Icon className="size-3.5" />
                          </span>
                          <div>
                            <p className="font-bold text-fg">{tx.svc}</p>
                            <p className="text-[11px] text-fg-muted">{tx.time}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3.5 py-3 font-medium text-fg">{tx.who}</td>
                      <td className="px-3.5 py-3 text-right">
                        <p className="font-extrabold text-fg">{tx.amount}</p>
                        <p className="text-[11px] font-semibold text-emerald-600">Fee: {tx.fee}</p>
                      </td>
                      <td className="hidden px-3.5 py-3 text-right text-xs font-semibold text-fg-muted sm:table-cell">
                        {tx.cashDelta}
                      </td>
                      <td className="px-3.5 py-3 text-right">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            tx.status === 'success'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                          }`}
                        >
                          {tx.status === 'success'
                            ? t('landing.mock.success')
                            : t('landing.mock.pending')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Floating Pro Badge 1: Top Right */}
      <div className="animate-float absolute -top-5 -right-3 hidden rounded-xl border border-border/80 bg-surface/95 p-3 shadow-xl backdrop-blur-md sm:flex sm:items-center sm:gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950/80 dark:text-orange-400">
          <ShieldCheck className="size-5" />
        </span>
        <div>
          <p className="text-xs font-bold text-fg">DPDP Privacy Shield</p>
          <p className="text-[11px] text-fg-muted">Aadhaar auto-masked (•••• 4892)</p>
        </div>
      </div>

      {/* Floating Pro Badge 2: Bottom Left */}
      <div
        className="animate-float absolute -bottom-5 -left-3 hidden rounded-xl border border-border/80 bg-surface/95 p-3 shadow-xl backdrop-blur-md sm:flex sm:items-center sm:gap-3"
        style={{ animationDelay: '1.5s' }}
      >
        <span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/80 dark:text-emerald-400">
          <CheckCircle2 className="size-5" />
        </span>
        <div>
          <p className="text-xs font-bold text-fg">Cash Drawer Reconciled</p>
          <p className="text-[11px] text-fg-muted">₹0 gap at closing</p>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Ecosystem & Trust Strip */

function EcosystemStrip() {
  const partners = [
    'SBI Kiosk Banking',
    'PayNearby Retailer',
    'Spice Money Adhikari',
    'CSC Digital Seva (VLE)',
    'Airtel Payments Bank',
    'Fino Payments Bank',
    'Bank of Baroda BC',
    'UTIITSL / NSDL PAN',
  ];

  return (
    <section className="border-b border-border/60 bg-surface/50 py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-fg-muted">
          Works seamlessly alongside all banking, kiosk & CSC operator portals
        </p>
        <div className="marquee mt-6 overflow-hidden">
          <div className="marquee-track gap-3">
            {[...partners, ...partners].map((p, i) => (
              <div
                key={p + i}
                aria-hidden={i >= partners.length}
                className="mr-3 shrink-0 rounded-lg border border-border/70 bg-surface px-4 py-2 text-sm font-bold text-fg shadow-sm"
              >
                {p}
              </div>
            ))}
          </div>
        </div>

        {/* 4 Key Performance Numbers */}
        <div className="mt-10 grid grid-cols-2 gap-4 border-t border-border/60 pt-8 sm:grid-cols-4 sm:gap-8">
          <div className="text-center">
            <p className="font-display text-3xl font-extrabold text-brand sm:text-4xl">
              <CountUp to={10} suffix="+" />
            </p>
            <p className="mt-1 text-xs font-semibold text-fg-muted">Counter Services</p>
          </div>
          <div className="text-center">
            <p className="font-display text-3xl font-extrabold text-emerald-600 sm:text-4xl">₹0</p>
            <p className="mt-1 text-xs font-semibold text-fg-muted">Free Plan Forever</p>
          </div>
          <div className="text-center">
            <p className="font-display text-3xl font-extrabold text-brand-alt sm:text-4xl">
              <CountUp to={3} /> Sec
            </p>
            <p className="mt-1 text-xs font-semibold text-fg-muted">Fast Record Entry</p>
          </div>
          <div className="text-center">
            <p className="font-display text-3xl font-extrabold text-amber-600 sm:text-4xl">
              <CountUp to={100} suffix="%" />
            </p>
            <p className="mt-1 text-xs font-semibold text-fg-muted">Offline-Ready Sync</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Bento Grid: Pro Superpowers */

function SuperpowersBento() {
  const { t } = useI18n();

  return (
    <section id="features" className="scroll-mt-20 border-b border-border/60 py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-brand">
            {t('landing.cap.eyebrow')}
          </p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            {t('landing.cap.title')}
          </h2>
          <p className="mt-3 text-lg text-fg-muted">
            Engineered specifically for the real-world speed, cash movements, and customer trust
            required at your counter.
          </p>
        </Reveal>

        {/* Bento Grid Layout */}
        <Reveal className="mt-14 grid gap-6 md:grid-cols-3">
          {/* Bento Card 1 (Large - Spans 2 Cols) */}
          <div className="pro-card relative overflow-hidden p-7 md:col-span-2">
            <div className="flex flex-col justify-between sm:flex-row sm:items-center">
              <div>
                <span className="grid size-11 place-items-center rounded-xl bg-brand-bg text-brand">
                  <ClipboardList className="size-6" />
                </span>
                <h3 className="mt-4 font-display text-xl font-extrabold text-fg">
                  {t('landing.cap.1.t')}
                </h3>
                <p className="mt-1 max-w-lg text-sm text-fg-muted">{t('landing.cap.1.d')}</p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 sm:mt-0">
                <Sparkles className="size-3.5" /> 3-Sec Entry
              </span>
            </div>

            {/* Visual simulation inside card */}
            <div className="mt-6 rounded-xl border border-border/80 bg-bg p-4">
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-surface p-2.5">
                  <span className="text-[10px] font-bold text-fg-muted uppercase">Service</span>
                  <p className="font-extrabold text-brand">AEPS Cash Out</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface p-2.5">
                  <span className="text-[10px] font-bold text-fg-muted uppercase">Amount</span>
                  <p className="font-extrabold text-fg">₹5,000</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface p-2.5">
                  <span className="text-[10px] font-bold text-fg-muted uppercase">
                    Customer Fee
                  </span>
                  <p className="font-extrabold text-emerald-600">₹25</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface p-2.5">
                  <span className="text-[10px] font-bold text-fg-muted uppercase">Drawer Cash</span>
                  <p className="font-extrabold text-amber-600">− ₹4,975 net</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bento Card 2: Cashbook */}
          <div className="pro-card relative p-7">
            <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/80 dark:text-emerald-400">
              <ReceiptIndianRupee className="size-6" />
            </span>
            <h3 className="mt-4 font-display text-xl font-extrabold text-fg">
              {t('landing.cap.2.t')}
            </h3>
            <p className="mt-1 text-sm text-fg-muted">{t('landing.cap.2.d')}</p>
            <div className="mt-5 rounded-lg border border-border/80 bg-bg p-3 text-xs">
              <div className="flex items-center justify-between font-bold">
                <span className="text-fg-muted">Physical Drawer:</span>
                <span className="text-emerald-600 font-extrabold">₹11,320</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-fg-muted">
                <span>Evening closing gap:</span>
                <span className="font-bold text-fg">₹0.00 (Match)</span>
              </div>
            </div>
          </div>

          {/* Bento Card 3: Khata & WhatsApp */}
          <div className="pro-card relative p-7">
            <span className="grid size-11 place-items-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/80 dark:text-orange-400">
              <HandCoins className="size-6" />
            </span>
            <h3 className="mt-4 font-display text-xl font-extrabold text-fg">
              {t('landing.cap.3.t')}
            </h3>
            <p className="mt-1 text-sm text-fg-muted">{t('landing.cap.3.d')}</p>
            <div className="mt-5 rounded-lg border border-orange-200/80 bg-orange-50/50 p-3 text-xs dark:border-orange-900/60 dark:bg-orange-950/30">
              <div className="flex items-center justify-between">
                <span className="font-bold text-orange-900 dark:text-orange-300">
                  Ramesh (PAN Card)
                </span>
                <span className="font-black text-amber-600">₹107 Due</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-orange-600">
                <MessageSquare className="size-3.5" /> 1-Click WhatsApp Reminder
              </div>
            </div>
          </div>

          {/* Bento Card 4: DPDP & Privacy */}
          <div className="pro-card relative p-7">
            <span className="grid size-11 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/80 dark:text-amber-400">
              <ShieldCheck className="size-6" />
            </span>
            <h3 className="mt-4 font-display text-xl font-extrabold text-fg">
              DPDP & RBI Privacy Shield
            </h3>
            <p className="mt-1 text-sm text-fg-muted">
              {t('landing.work.1')} Full Aadhaar and card numbers are rejected at entry. Complete
              regulatory peace of mind.
            </p>
            <div className="mt-5 rounded-lg border border-border/80 bg-bg p-3 text-xs font-mono text-fg-muted">
              Input: 4920 8122 9381{' '}
              <span className="font-bold text-red-500">→ [Masked: •••• 9381]</span>
            </div>
          </div>

          {/* Bento Card 5: Thermal Printing */}
          <div className="pro-card relative p-7">
            <span className="grid size-11 place-items-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/80 dark:text-rose-400">
              <Printer className="size-6" />
            </span>
            <h3 className="mt-4 font-display text-xl font-extrabold text-fg">
              Thermal Receipts & PDF
            </h3>
            <p className="mt-1 text-sm text-fg-muted">
              {t('landing.cap.5.d')} Print directly to 58mm/80mm Bluetooth thermal printers or
              download branded customer slips.
            </p>
            <div className="mt-5 flex items-center justify-between rounded-lg border border-border/80 bg-bg p-2.5 text-xs font-bold text-fg-muted">
              <span>Bluetooth 58mm</span>
              <span className="text-emerald-600">● Connected</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Phone + WhatsApp */

function PhoneSection() {
  const brand = useBrand();
  const points = [
    {
      icon: Smartphone,
      t: 'Runs on any Android phone',
      d: 'No computer needed. Open it in the browser or add it to your home screen.',
    },
    {
      icon: MessageSquare,
      t: 'Receipts & reminders on WhatsApp',
      d: 'Send a receipt or a payment reminder to the customer in one tap.',
    },
    {
      icon: WifiOff,
      t: 'Keeps working without internet',
      d: 'Entries are saved on the phone and sync once the network is back.',
    },
  ];
  return (
    <section className="overflow-hidden border-b border-border/60 bg-surface/50 py-20 lg:py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div>
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-widest text-brand">On your phone</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
              Your whole counter, in your pocket
            </h2>
          </Reveal>
          <ul className="mt-8 space-y-5">
            {points.map((p, i) => {
              const Icon = p.icon;
              return (
                <Reveal as="li" key={p.t} delay={i * 120} className="flex gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-bg text-brand">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <p className="font-display font-bold text-fg">{p.t}</p>
                    <p className="mt-0.5 text-sm text-fg-muted">{p.d}</p>
                  </div>
                </Reveal>
              );
            })}
          </ul>
        </div>

        <Reveal delay={150} className="relative mx-auto w-full max-w-md">
          {/* soft brand disc behind the phone */}
          <div
            className="absolute left-1/2 top-1/2 aspect-square w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-bg"
            aria-hidden
          />

          <div className="animate-float relative mx-auto w-[min(300px,78vw)]">
            <IPhoneFrame>
              <PhoneAppScreen />
            </IPhoneFrame>
          </div>

          {/* WhatsApp receipt bubble */}
          <Reveal delay={900} className="absolute right-0 top-[14%] sm:-right-6">
            <div className="max-w-[12.5rem] rounded-2xl rounded-tr-sm bg-[#dcf8c6] p-3 text-[11px] text-[#1f2d1f] shadow-xl">
              <p className="font-bold">Receipt · {brand.name}</p>
              <p className="mt-0.5">AEPS ₹5,000 paid to Geeta Devi. Thank you!</p>
              <p className="mt-1 text-right text-[10px] text-[#4b6b4b]">10:42 ✓✓</p>
            </div>
          </Reveal>

          {/* reminder being typed */}
          <Reveal delay={1300} className="absolute bottom-[22%] left-0 sm:-left-6">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-border bg-surface px-3 py-2.5 shadow-xl">
              <span className="typing-dot size-1.5 rounded-full bg-fg-muted" />
              <span
                className="typing-dot size-1.5 rounded-full bg-fg-muted"
                style={{ animationDelay: '.2s' }}
              />
              <span
                className="typing-dot size-1.5 rounded-full bg-fg-muted"
                style={{ animationDelay: '.4s' }}
              />
              <span className="ml-1 text-[11px] font-semibold text-fg-muted">
                Reminder: ₹107 due
              </span>
            </div>
          </Reveal>

          {/* offline badge */}
          <Reveal delay={1700} className="absolute bottom-[6%] right-2 sm:-right-2">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-[11px] font-bold text-fg shadow-xl">
              <WifiOff className="size-4 text-brand" /> Saved offline · will sync
            </div>
          </Reveal>
        </Reveal>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Interactive Simulator */

function InteractiveSimulator() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'record' | 'cashbook' | 'dues' | 'closing'>('record');

  return (
    <section
      id="simulator"
      className="scroll-mt-20 border-b border-border/60 bg-surface/40 py-20 lg:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-brand">
            {t('landing.day.eyebrow')}
          </p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            {t('landing.day.title')}
          </h2>
          <p className="mt-3 text-lg text-fg-muted">
            {t('landing.day.sub')} Click each step below to test how fast your counter runs.
          </p>
        </Reveal>

        {/* Tab Buttons */}
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {[
            { id: 'record', label: '1. Serve a Customer', icon: ClipboardList },
            { id: 'cashbook', label: '2. Settle Cash Drawer', icon: ReceiptIndianRupee },
            { id: 'dues', label: '3. Collect Customer Dues', icon: HandCoins },
            { id: 'closing', label: '4. EOD Daily Closing', icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all ${
                  active
                    ? 'bg-brand text-on-brand shadow-lg shadow-brand/25 ring-2 ring-brand/40'
                    : 'border border-border/80 bg-surface text-fg hover:bg-surface-muted'
                }`}
              >
                <Icon className="size-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Simulator Screen Container */}
        <div className="mx-auto mt-10 max-w-3xl">
          <div className="pro-window overflow-hidden bg-surface p-6 sm:p-8">
            <div key={activeTab} className="animate-rise">
              {activeTab === 'record' && <SimRecordScreen />}
              {activeTab === 'cashbook' && <SimCashbookScreen />}
              {activeTab === 'dues' && <SimDuesScreen />}
              {activeTab === 'closing' && <SimClosingScreen />}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SimRecordScreen() {
  return (
    <div>
      <div className="flex items-center justify-between border-b border-border/70 pb-4">
        <div>
          <h3 className="text-lg font-extrabold text-fg">New Service Entry</h3>
          <p className="text-xs text-fg-muted">AEPS Cash Withdrawal · 3-second rapid log</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
          Auto-Masked
        </span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border/80 bg-bg p-3">
          <span className="text-[11px] font-bold text-fg-muted uppercase">Service Selected</span>
          <p className="mt-1 font-bold text-brand">AEPS Cash Out (Biometric)</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-bg p-3">
          <span className="text-[11px] font-bold text-fg-muted uppercase">Amount Withdrawn</span>
          <p className="mt-1 font-display text-lg font-black text-fg">₹5,000</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-bg p-3">
          <span className="text-[11px] font-bold text-fg-muted uppercase">Customer Mobile</span>
          <p className="mt-1 font-mono font-bold text-fg">98765 43210 (Geeta Devi)</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-bg p-3">
          <span className="text-[11px] font-bold text-fg-muted uppercase">Aadhaar (Last 4)</span>
          <p className="mt-1 font-mono font-bold text-fg">•••• •••• 4892</p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-brand/20 bg-brand-bg/50 p-4">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-fg">Customer Fee Charged:</span>
          <span className="text-emerald-600 font-extrabold">+₹25.00</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs font-bold">
          <span className="text-fg">Cash handed to customer:</span>
          <span className="text-red-600 font-extrabold">−₹5,000.00</span>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-6 text-sm font-bold text-on-brand shadow-md shadow-brand/20 transition hover:bg-brand-strong"
        >
          <Check className="size-4" />
          <span>Save & Print Slip</span>
        </button>
      </div>
    </div>
  );
}

function SimCashbookScreen() {
  return (
    <div>
      <div className="flex items-center justify-between border-b border-border/70 pb-4">
        <div>
          <h3 className="text-lg font-extrabold text-fg">Daily Cashbook & Drawer Balance</h3>
          <p className="text-xs text-fg-muted">Tally physical cash against transactions</p>
        </div>
        <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700 dark:bg-orange-950/60 dark:text-orange-400">
          Double-Entry
        </span>
      </div>

      <div className="mt-5 space-y-2.5">
        {[
          { label: 'Opening Drawer Balance', amt: '₹10,000', up: true, type: 'Opening' },
          { label: 'AEPS Withdrawal (Geeta)', amt: '− ₹5,000', up: false, type: 'Cash Out' },
          { label: 'Customer Fee (Geeta)', amt: '+ ₹25', up: true, type: 'Fee' },
          { label: 'DMT Transfer Received (Ramesh)', amt: '+ ₹2,530', up: true, type: 'Cash In' },
          { label: 'Shop Expense (Paper Rolls)', amt: '− ₹200', up: false, type: 'Expense' },
        ].map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between rounded-xl border border-border/70 bg-bg px-4 py-2.5 text-sm"
          >
            <div className="flex items-center gap-2.5">
              {row.up ? (
                <Plus className="size-4 text-emerald-600" />
              ) : (
                <Minus className="size-4 text-amber-600" />
              )}
              <span className="font-semibold text-fg">{row.label}</span>
            </div>
            <span className={`font-mono font-bold ${row.up ? 'text-emerald-600' : 'text-fg'}`}>
              {row.amt}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-800 dark:text-emerald-300">
            Expected in Physical Drawer Right Now
          </p>
          <p className="mt-0.5 font-display text-2xl font-black text-emerald-700 dark:text-emerald-400">
            ₹7,355.00
          </p>
        </div>
        <span className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
          Verified Balanced
        </span>
      </div>
    </div>
  );
}

function SimDuesScreen() {
  const { t } = useI18n();
  return (
    <div>
      <div className="flex items-center justify-between border-b border-border/70 pb-4">
        <div>
          <h3 className="text-lg font-extrabold text-fg">{t('landing.screen.dues')} & Khata</h3>
          <p className="text-xs text-fg-muted">
            Track partial collections and send WhatsApp reminders
          </p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
          2 Customers
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {[
          { who: 'Geeta Devi', svc: 'Aadhaar Address Update', amt: '₹430', phone: '98765 43210' },
          { who: 'Ramesh Kumar', svc: 'PAN Card Correction', amt: '₹1,200', phone: '91234 56780' },
        ].map((cust) => (
          <div
            key={cust.who}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-bg p-4"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-brand-bg font-extrabold text-brand">
                {cust.who[0]}
              </span>
              <div>
                <p className="font-bold text-fg">{cust.who}</p>
                <p className="text-xs text-fg-muted">
                  {cust.svc} · {cust.phone}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="font-display text-lg font-black text-amber-600">{cust.amt}</span>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <MessageSquare className="size-3.5" />
                <span>WhatsApp</span>
              </button>
              <button
                type="button"
                className="rounded-lg bg-brand px-3.5 py-1.5 text-xs font-bold text-on-brand shadow-sm transition hover:bg-brand-strong"
              >
                {t('landing.screen.collect')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SimClosingScreen() {
  return (
    <div>
      <div className="flex items-center justify-between border-b border-border/70 pb-4">
        <div>
          <h3 className="text-lg font-extrabold text-fg">1-Click End of Day Closing</h3>
          <p className="text-xs text-fg-muted">
            Match cash, generate PDF shift report, lock records
          </p>
        </div>
        <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
          Daily Close
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/80 bg-bg p-3.5">
          <span className="text-[11px] font-bold text-fg-muted uppercase">Total Transactions</span>
          <p className="mt-1 font-display text-2xl font-black text-fg">42</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-bg p-3.5">
          <span className="text-[11px] font-bold text-fg-muted uppercase">Customer Fees</span>
          <p className="mt-1 font-display text-2xl font-black text-emerald-600">₹840</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-bg p-3.5">
          <span className="text-[11px] font-bold text-fg-muted uppercase">Cash Drawer Status</span>
          <p className="mt-1 font-display text-2xl font-black text-orange-600">Matched</p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-border/80 bg-surface-muted/50 p-4">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-fg">Physical Notes Counted:</span>
          <span className="font-mono text-fg">₹7,355.00</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs font-bold">
          <span className="text-fg">Cashbook Calculated:</span>
          <span className="font-mono text-fg">₹7,355.00</span>
        </div>
        <div className="mt-2 border-t border-border/70 pt-2 flex items-center justify-between text-xs font-black text-emerald-600">
          <span>Closing Variance:</span>
          <span>₹0.00 (Zero discrepancy)</span>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-6 text-sm font-bold text-on-brand shadow-md shadow-brand/20"
        >
          <Check className="size-4" />
          <span>Lock Day & Download PDF Shift Report</span>
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Interactive ROI Calculator */

function RoiCalculator() {
  const [dailyTx, setDailyTx] = useState(40);

  // Calculations:
  // Average minutes saved per entry: 1.5 min vs manual paper
  const monthlyHoursSaved = Math.round((dailyTx * 1.5 * 26) / 60);
  // Average uncollected dues recovered via WhatsApp reminders: ₹80 per 10 transactions
  const duesRecovered = Math.round((dailyTx / 10) * 85 * 26);

  return (
    <section id="calculator" className="scroll-mt-20 border-b border-border/60 py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-brand">Value Calculator</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            See how much time and money you save every month
          </h2>
          <p className="mt-3 text-lg text-fg-muted">
            Move the slider to match your daily customer footfall.
          </p>
        </Reveal>

        <Reveal className="pro-card mx-auto mt-12 max-w-4xl p-6 sm:p-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-fg-muted">
                Daily Customer Transactions:
              </p>
              <p className="font-display text-3xl font-black text-brand">
                {dailyTx} <span className="text-lg font-semibold text-fg-muted">customers/day</span>
              </p>
            </div>
            <span className="rounded-full bg-brand-bg px-4 py-1.5 text-xs font-bold text-brand">
              Based on 26 active counter days
            </span>
          </div>

          {/* Range Slider */}
          <div className="mt-6">
            <input
              type="range"
              min="10"
              max="150"
              step="5"
              value={dailyTx}
              onChange={(e) => setDailyTx(Number(e.target.value))}
              className="h-2.5 w-full cursor-pointer appearance-none rounded-lg bg-surface-muted accent-brand"
            />
            <div className="mt-2 flex justify-between text-xs font-semibold text-fg-muted">
              <span>10 / day (Part-time Kiosk)</span>
              <span>75 / day (Busy Center)</span>
              <span>150+ / day (Multi-Staff Hub)</span>
            </div>
          </div>

          {/* Computed Metrics */}
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <div className="rounded-xl border border-border/80 bg-bg p-5 text-center">
              <span className="text-xs font-bold uppercase tracking-wider text-fg-muted">
                Hours Saved on Registers
              </span>
              <p className="mt-2 font-display text-3xl font-black text-orange-600">
                {monthlyHoursSaved} <span className="text-sm font-semibold">hrs/mo</span>
              </p>
              <p className="mt-1 text-xs text-fg-muted">No more flipping through diaries</p>
            </div>

            <div className="rounded-xl border border-border/80 bg-bg p-5 text-center">
              <span className="text-xs font-bold uppercase tracking-wider text-fg-muted">
                Uncollected Dues Recovered
              </span>
              <p className="mt-2 font-display text-3xl font-black text-emerald-600">
                ₹{duesRecovered.toLocaleString('en-IN')}
              </p>
              <p className="mt-1 text-xs text-fg-muted">Via instant WhatsApp reminders</p>
            </div>

            <div className="rounded-xl border border-border/80 bg-bg p-5 text-center">
              <span className="text-xs font-bold uppercase tracking-wider text-fg-muted">
                Evening Day Closing
              </span>
              <p className="mt-2 font-display text-3xl font-black text-amber-600">
                60 sec <span className="text-sm font-semibold text-fg-muted">(vs 45 min)</span>
              </p>
              <p className="mt-1 text-xs text-fg-muted">Zero headache cash reconciliation</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Side-by-Side Comparison */

function ComparisonMatrix() {
  const rows = [
    {
      feature: 'Record Entry Speed',
      paper: '2–3 minutes (handwritten)',
      excel: '1–2 minutes (clunky on phone)',
      pro: '3 seconds (smart auto-fields)',
    },
    {
      feature: 'Cash Drawer Tally',
      paper: 'Manual counting & math mistakes',
      excel: 'Formulas break constantly',
      pro: 'Real-time auto-reconciliation',
    },
    {
      feature: 'Customer Khata & Dues',
      paper: 'Scattered across loose pages',
      excel: 'No customer notification',
      pro: '1-Click WhatsApp payment links',
    },
    {
      feature: 'Aadhaar & Card Privacy',
      paper: 'Plaintext risk (illegal)',
      excel: 'Unencrypted spreadsheets',
      pro: 'DPDP & RBI compliant masking',
    },
    {
      feature: 'Network Reliability',
      paper: 'Offline, but not searchable',
      excel: 'Crashes on mobile web',
      pro: '100% native offline auto-sync',
    },
    {
      feature: 'EOD Shift Closing',
      paper: '30–45 stressful minutes',
      excel: 'Manual daily summary',
      pro: '1-Click tallied PDF report',
    },
  ];

  return (
    <section id="comparison" className="scroll-mt-20 border-b border-border/60 py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-brand">Comparison</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            Why modern CSPs replace paper registers
          </h2>
          <p className="mt-3 text-lg text-fg-muted">
            See the difference between old-fashioned notebooks and a pro counter operating system.
          </p>
        </Reveal>

        <div className="mt-12 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/80">
                <th className="py-4 font-bold text-fg">Capability</th>
                <th className="px-4 py-4 font-bold text-fg-muted">Paper Diary ❌</th>
                <th className="px-4 py-4 font-bold text-fg-muted">Excel / Generic ❌</th>
                <th className="rounded-t-xl bg-brand-bg/80 px-4 py-4 font-display font-extrabold text-brand">
                  CSP2All Pro Platform ✨
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((r, i) => (
                <tr key={r.feature} className={i % 2 === 0 ? 'bg-surface-muted/20' : ''}>
                  <td className="py-3.5 font-bold text-fg">{r.feature}</td>
                  <td className="px-4 py-3.5 text-xs text-fg-muted">{r.paper}</td>
                  <td className="px-4 py-3.5 text-xs text-fg-muted">{r.excel}</td>
                  <td className="bg-brand-bg/40 px-4 py-3.5 text-xs font-extrabold text-brand">
                    ✓ {r.pro}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Who It's For */

function WhoFor() {
  const { t } = useI18n();
  const who = [
    {
      icon: Landmark,
      art: BankArt,
      title: t('landing.who.1.t'),
      desc: t('landing.who.1.d'),
      badge: 'SBI, PNB, BOB, Fino Kiosks',
    },
    {
      icon: Layers,
      art: CscArt,
      title: t('landing.who.2.t'),
      desc: t('landing.who.2.d'),
      badge: 'PAN, Aadhaar & Certificates',
    },
    {
      icon: Store,
      art: ShopArt,
      title: t('landing.who.3.t'),
      desc: t('landing.who.3.d'),
      badge: 'Recharge, BBPS & Rail Tickets',
    },
  ];

  return (
    <section className="border-b border-border/60 bg-surface/50 py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-brand">Tailored For You</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            {t('landing.who.title')}
          </h2>
          <p className="mt-3 text-lg text-fg-muted">{t('landing.who.sub')}</p>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {who.map((w, i) => {
            const Icon = w.icon;
            const Art = w.art;
            return (
              <Reveal key={w.title} delay={i * 120} className="pro-card overflow-hidden">
                <div className="border-b border-border/70 bg-bg/60 px-6 pt-6">
                  <Art className="mx-auto h-36 w-full" />
                </div>
                <div className="p-7">
                  <span className="inline-flex items-center gap-2 text-brand">
                    <Icon className="size-5" />
                  </span>
                  <span className="ml-2 inline-block rounded-full bg-surface-muted px-2.5 py-0.5 text-[11px] font-bold text-fg-muted">
                    {w.badge}
                  </span>
                  <h3 className="mt-3 font-display text-xl font-extrabold text-fg">{w.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{w.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Testimonials */

function Testimonials() {
  const reviews = [
    {
      name: 'Manoj Sharma',
      role: 'SBI Kiosk Banking Agent',
      location: 'Gorakhpur, Uttar Pradesh',
      stars: 5,
      quote:
        'Zero cash discrepancy since day one. Evening closing used to take 45 minutes of stressful notebook math. Now I press one button and match my drawer to the exact rupee.',
    },
    {
      name: 'Pooja Devi',
      role: 'CSC VLE & Digital Seva Center',
      location: 'Patna, Bihar',
      stars: 5,
      quote:
        'Customers love receiving instant WhatsApp receipts for PAN applications and electricity bills. My uncollected dues dropped by 80% within two weeks.',
    },
    {
      name: 'Rajesh Patel',
      role: 'Multi-service Retailer (PayNearby + CSC)',
      location: 'Ahmedabad, Gujarat',
      stars: 5,
      quote:
        'The offline mode saved our counter during monsoon broadband outages. We recorded over 60 AEPS cash-outs without internet, and everything synced seamlessly.',
    },
  ];

  return (
    <section className="border-b border-border/60 py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-brand">
            Verified Operator Stories
          </p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            Trusted by 10,000+ counter operators across India
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {reviews.map((r, i) => (
            <Reveal
              key={r.name}
              delay={i * 120}
              className="pro-card flex flex-col justify-between p-7"
            >
              <div>
                <div className="flex gap-1 text-amber-500">{'★'.repeat(r.stars)}</div>
                <p className="mt-4 text-sm leading-relaxed text-fg italic">
                  &ldquo;{r.quote}&rdquo;
                </p>
              </div>

              <div className="mt-6 flex items-center gap-3 border-t border-border/70 pt-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand font-display text-base font-extrabold text-on-brand">
                  {r.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </span>
                <div>
                  <p className="font-extrabold text-fg">{r.name}</p>
                  <p className="text-xs font-semibold text-brand">{r.role}</p>
                  <p className="text-[11px] text-fg-muted">{r.location}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- FAQ Section */

function Faq() {
  const { t, tk } = useI18n();
  const qa = ['1', '2', '3', '4', '5', '6'] as const;

  return (
    <section
      id="faq"
      className="scroll-mt-20 border-b border-border/60 bg-surface/40 py-20 lg:py-24"
    >
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-brand">FAQ</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            {t('landing.faq.title')}
          </h2>
          <p className="mt-3 text-lg text-fg-muted">
            Everything you need to know about setting up and running your counter.
          </p>
        </div>

        <div className="mt-12 space-y-3">
          {qa.map((n) => (
            <details
              key={n}
              className="group rounded-2xl border border-border/80 bg-surface px-6 py-4 shadow-sm transition hover:border-brand/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display font-bold text-fg [&::-webkit-details-marker]:hidden">
                <span className="text-base">{tk(`landing.faq.q${n}`)}</span>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-muted text-fg transition-transform duration-200 group-open:rotate-45">
                  <Plus className="size-4" />
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                {tk(`landing.faq.a${n}`)}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Final High-Conversion CTA */

function FinalCta() {
  const { t } = useI18n();
  const brand = useBrand();

  return (
    <section className="relative overflow-hidden py-20 lg:py-28">
      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-brand p-8 sm:p-14 text-center text-on-brand shadow-xl shadow-brand/20">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3.5 py-1 text-xs font-extrabold backdrop-blur-md">
            ✨ Free Plan Available · Start in 2 Minutes
          </span>

          <h2 className="mt-5 font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
            {t('landing.final.title')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base font-medium text-white/90 sm:text-lg">
            Join thousands of counter operators who replaced cluttered diaries with {brand.name}.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex min-h-13 items-center justify-center gap-2.5 rounded-xl bg-white px-8 text-base font-extrabold text-[#9a2f1e] shadow-xl transition-all duration-200 hover:scale-105 active:scale-100"
            >
              <span>{t('landing.cta.create')}</span>
              <ArrowRight className="size-5" />
            </Link>
          </div>

          <p className="mt-5 text-xs font-semibold text-white/80">
            No credit card or documents required · Free tier forever · Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Main Export */

export function LandingContent() {
  return (
    <MarketingShell>
      <Hero />
      <EcosystemStrip />
      <LiveCounter />
      <SuperpowersBento />
      <PhoneSection />
      <InteractiveSimulator />
      <RoiCalculator />
      <ComparisonMatrix />
      <WhoFor />
      <Testimonials />
      <Faq />
      <FinalCta />
    </MarketingShell>
  );
}
