import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { SHIPPING } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Delivery Policy',
  description: 'How and when you get access after signing up or paying.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/shipping-policy' },
};

export default function Page() {
  return <LegalPage doc={SHIPPING} />;
}
