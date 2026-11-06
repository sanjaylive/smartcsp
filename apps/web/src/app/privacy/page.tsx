import { LegalPage } from '@/components/legal';

export const metadata = { title: 'Privacy Notice' };

export default function Privacy() {
  return (
    <LegalPage
      title="auth.email.privacy"
      sections={[
        { h: 'legal.privacy.h1', p: 'legal.privacy.p1' },
        { h: 'legal.privacy.h2', p: 'legal.privacy.p2' },
        { h: 'legal.privacy.h3', p: 'legal.privacy.p3' },
        { h: 'legal.privacy.h4', p: 'legal.privacy.p4' },
      ]}
    />
  );
}
