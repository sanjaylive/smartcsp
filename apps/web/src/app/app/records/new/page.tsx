'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ServiceCode } from '@csp2all/shared';
import { RecordWizard } from '@/components/record-wizard';

/** Deep-linkable page version of the step-by-step record flow (the drawer is used elsewhere). */
function NewRecordInner() {
  const params = useSearchParams();
  const router = useRouter();
  return (
    <RecordWizard
      layout="page"
      initialCode={params.get('service') as ServiceCode | null}
      initialCustomId={params.get('custom')}
      onClose={() => router.push('/app/records')}
    />
  );
}

export default function NewRecordPage() {
  return (
    <Suspense>
      <NewRecordInner />
    </Suspense>
  );
}
