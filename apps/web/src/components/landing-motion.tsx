'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** True when the visitor asked the OS for less motion. */
export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Calls back once when the element first scrolls into view. */
function useInView<T extends Element>(onIn: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      onIn();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onIn();
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

/** Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'li' | 'section';
}) {
  const [inView, setInView] = useState(false);
  const ref = useInView<HTMLDivElement>(() => setInView(true));
  const style: CSSProperties = delay ? { transitionDelay: `${delay}ms` } : {};
  return (
    <Tag
      ref={ref as never}
      style={style}
      className={`reveal ${inView ? 'is-in' : ''} ${className}`}
    >
      {children}
    </Tag>
  );
}

/** Counts from 0 up to `to` once visible. Renders the final value for no-JS and reduced motion. */
export function CountUp({
  to,
  prefix = '',
  suffix = '',
  duration = 1400,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const [value, setValue] = useState(to);
  const ref = useInView<HTMLSpanElement>(() => {
    if (prefersReducedMotion()) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(to * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    setValue(0);
    requestAnimationFrame(tick);
  });
  return (
    <span ref={ref} className="money">
      {prefix}
      {value.toLocaleString('en-IN')}
      {suffix}
    </span>
  );
}
