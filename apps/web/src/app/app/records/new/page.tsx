'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ServiceCode } from '@csp2all/shared';
import { RecordWizard } from '@/components/record-wizard';

/** Deep-linkable new-record page; `?service=CODE` (and `&custom=ID`) preselects the service. */
function NewRecordInner() {
  const params = useSearchParams();
  const router = useRouter();
  return (
    <RecordWizard
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
