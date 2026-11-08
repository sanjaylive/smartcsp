import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { DISCLAIMER } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Disclaimer',
  description: 'What the app is and is not, and the limits of the figures it shows.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/disclaimer' },
};

export default function Page() {
  return <LegalPage doc={DISCLAIMER} />;
}
