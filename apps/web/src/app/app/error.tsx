'use client';

import { ErrorBlock } from '@/components/query-state';

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorBlock error={error} onRetry={reset} />;
}
