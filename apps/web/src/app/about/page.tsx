import type { Metadata } from 'next';
import { AboutContent } from '@/components/about-content';

export const metadata: Metadata = {
  title: 'About us',
  description:
    'Why we built a simple, private record-keeping app for CSP and Seva Kendra counters.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/about' },
};

export default function Page() {
  return <AboutContent />;
}
