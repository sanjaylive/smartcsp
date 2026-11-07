import type { Metadata } from 'next';
import { AuthPage } from '@/components/auth-page';

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Create a free account and set up your service counter in a few minutes.',
};

export default function RegisterPage() {
  return <AuthPage mode="register" />;
}
