'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useConfirm } from '@/components/dialog';
import { Guard } from '@/components/guard';
import { useToast } from '@/components/toast';
import {
  Badge,
  Callout,
  Card,
  Empty,
  PageHeader,
  QueryState,
  Switch,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { get, patch } from '@/lib/api';
import { humanize } from '@/lib/format';
import { useCan } from '@/lib/session';
import type { CatalogService } from '@/lib/types';

export default function ServicesPage() {
  return (
    <Guard perm="platform.view" what="the service catalog">
      <ServicesInner />
    </Guard>
  );
}

function ServicesInner() {
  const q = useQuery({
    queryKey: ['catalog'],
    queryFn: () => get<{ items: CatalogService[] }>('/v1/admin/services'),
  });
  const can = useCan();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, dialog] = useConfirm();

  const toggle = (s: CatalogService, platformEnabled: boolean) =>
    confirm({
      title: platformEnabled
        ? `Enable ${s.name} platform-wide?`
        : `Disable ${s.name} platform-wide?`,
      description: platformEnabled
        ? 'Shops that have this service selected can create new entries again, and new shops can choose it.'
        : 'New entries for this service are blocked in every shop and it cannot be selected during onboarding. Existing records, ledgers and reports are kept and stay visible.',
      body:
        !platformEnabled && s.enabledTenants > 0 ? (
          <Callout
            tone="warning"
            title={`${s.enabledTenants} shop${s.enabledTenants === 1 ? ' uses' : 's use'} this service`}
          >
            Their staff will see it as unavailable for new entries.
          </Callout>
        ) : undefined,
      confirmLabel: platformEnabled ? 'Enable service' : 'Disable service',
      tone: platformEnabled ? 'primary' : 'danger',
      onConfirm: async () => {
        await patch(`/v1/admin/services/${s.code}`, { platformEnabled });
        toast.success(`${s.name} ${platformEnabled ? 'enabled' : 'disabled'} platform-wide.`);
        void qc.invalidateQueries({ queryKey: ['catalog'] });
      },
    });

  return (
    <>
      <PageHeader
        title="Service catalog"
        description="Built-in services available to shops. Shops choose which of these they offer; you control platform-wide availability."
      />
      <div className="mb-3">
        <Callout tone="info" title="Disabling a service blocks new entries but keeps history">
          Existing records, cashbook postings and reports for a disabled service are never removed.
          Re-enabling restores entry immediately.
        </Callout>
      </div>
      <Card bodyClassName="p-0">
        <QueryState query={q}>
          {(d) =>
            d.items.length === 0 ? (
              <Empty title="No services defined" />
            ) : (
              <Table label="Service catalog">
                <thead>
                  <tr>
                    <Th>Service</Th>
                    <Th>Category</Th>
                    <Th>Workflow</Th>
                    <Th>Connector</Th>
                    <Th className="text-right">Shops using</Th>
                    <Th>Platform availability</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((s) => (
                    <tr key={s.code}>
                      <Td>
                        <div className="font-medium">{s.name}</div>
                        <div className="font-mono text-[11px] text-fg-muted">{s.code}</div>
                      </Td>
                      <Td>{humanize(s.category)}</Td>
                      <Td>{humanize(s.workflowType)}</Td>
                      <Td>
                        {s.providerCapable ? (
                          <Badge tone="info">Provider capable</Badge>
                        ) : (
                          <span className="text-xs text-fg-muted">Manual only</span>
                        )}
                      </Td>
                      <Td className="tabular text-right">{s.enabledTenants}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          {can('catalog.manage') && (
                            <Switch
                              checked={s.platformEnabled}
                              onChange={(v) => toggle(s, v)}
                              label={`${s.name} available platform-wide`}
                            />
                          )}
                          {s.platformEnabled ? (
                            <Badge tone="success">Enabled</Badge>
                          ) : (
                            <Badge tone="danger">Disabled</Badge>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )
          }
        </QueryState>
      </Card>
      {dialog}
    </>
  );
}
