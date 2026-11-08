import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { REFUND } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy',
  description: 'How to cancel a plan and when you can get a refund.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/refund-policy' },
};

export default function Page() {
  return <LegalPage doc={REFUND} />;
}
