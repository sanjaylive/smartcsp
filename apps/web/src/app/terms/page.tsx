import { LegalPage } from '@/components/legal';

export const metadata = { title: 'Terms of Service' };

export default function Terms() {
  return (
    <LegalPage
      title="auth.email.terms"
      sections={[
        { h: 'legal.terms.h1', p: 'legal.terms.p1' },
        { h: 'legal.terms.h2', p: 'legal.terms.p2' },
        { h: 'legal.terms.h3', p: 'legal.terms.p3' },
        { h: 'legal.terms.h4', p: 'legal.terms.p4' },
      ]}
    />
  );
}
