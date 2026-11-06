import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { addDays, effectivePermissions, localDate, type ServiceCode } from '@csp2all/shared';
import { loadConfig } from '../config/config';
import { AppModule } from '../app.module';
import { Db, type TenantCtx } from '../common/db';
import { LedgerService } from '../modules/ledger/ledger.service';
import { RecordsService } from '../modules/records/records.service';
import { MoneyService } from '../modules/money/money.service';
import { seedReferenceData } from './reference-data';

/**
 * FICTIONAL DEMO DATA for local development and demos. All names, phone numbers and references
 * are invented. Refuses to run in staging/production. Idempotent (skips if the demo shop exists).
 *
 *   node dist/cli/seed-demo.js
 * Sign in at the web app as demo.owner@example.test or demo.operator@example.test (codes arrive in Mailpit).
 */
async function main() {
  const c = loadConfig();
  if (c.NODE_ENV === 'production' || c.NODE_ENV === 'staging')
    throw new Error('Demo seed is disabled in staging/production.');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const db = app.get(Db);
  const ledger = app.get(LedgerService);
  const records = app.get(RecordsService);
  const money = app.get(MoneyService);
  await seedReferenceData(db);

  const existing = await db.asSystem((tx) =>
    tx.tenant.findUnique({ where: { provisioningKey: 'demo:seed' } }),
  );
  if (existing) {
    // eslint-disable-next-line no-console
    console.log('Demo shop already exists; nothing to do.');
    await app.close();
    return;
  }

  const owner = await db.user.upsert({
    where: { email: 'demo.owner@example.test' },
    create: { email: 'demo.owner@example.test', displayName: 'Mahesh Gupta (demo)' },
    update: {},
  });
  const operator = await db.user.upsert({
    where: { email: 'demo.operator@example.test' },
    create: { email: 'demo.operator@example.test', displayName: 'Neha Verma (demo)' },
    update: {},
  });
  const free = await db.plan.findFirstOrThrow({ where: { isDefault: true } });
  const services: ServiceCode[] = ['AEPS', 'DMT', 'PAN', 'BILL_PAYMENT'];
  const tenantId = crypto.randomUUID();

  await db.inTenant({ tenantId, userId: owner.id }, async (tx) => {
    await tx.tenant.create({
      data: {
        id: tenantId,
        name: 'Shree Ganesh Digital Seva Kendra (Demo)',
        ownerDisplayName: 'Mahesh Gupta',
        contactPhone: '9000000100',
        state: 'Uttar Pradesh',
        district: 'Varanasi',
        address: '12 Example Market Road (fictional)',
        provisioningKey: 'demo:seed',
        createdByUserId: owner.id,
      },
    });
    await tx.branch.create({ data: { tenantId, name: 'Main counter', isPrimary: true } });
    await tx.membership.create({
      data: { tenantId, userId: owner.id, role: 'OWNER', displayName: 'Mahesh Gupta' },
    });
    await tx.membership.create({
      data: {
        tenantId,
        userId: operator.id,
        role: 'OPERATOR',
        displayName: 'Neha Verma',
        invitedByUserId: owner.id,
      },
    });
    await tx.tenantService.createMany({
      data: services.map((s) => ({ tenantId, serviceCode: s })),
    });
    const sub = await tx.subscription.create({
      data: {
        tenantId,
        planVersionId: free.currentVersionId!,
        status: 'ACTIVE',
        billingCycle: 'NONE',
        currentPeriodStart: new Date(),
      },
    });
    await tx.subscriptionEvent.create({
      data: {
        tenantId,
        subscriptionId: sub.id,
        type: 'CREATED',
        toPlanVersionId: free.currentVersionId,
        actorType: 'SYSTEM',
        data: { demo: true },
      },
    });
    await ledger.ensureAccounts(tx, tenantId);
  });

  const ctx: TenantCtx = {
    tenantId,
    userId: owner.id,
    membershipId: null,
    role: 'OWNER',
    permissions: effectivePermissions('OWNER'),
    timezone: 'Asia/Kolkata',
    actorType: 'SYSTEM',
  };
  const today = localDate(new Date(), 'Asia/Kolkata');
  const yesterday = addDays(today, -1);

  const customers: Record<string, string> = {};
  for (const [name, phone] of [
    ['Ramesh Kumar', '9000000001'],
    ['Sunita Devi', '9000000002'],
    ['Mohd. Arif', '9000000003'],
    ['Priya Sharma', '9000000004'],
    ['Gurpreet Kaur', null],
    ['Lakshmi Iyer', '9000000006'],
  ] as const) {
    const cust = await db.inTenant(ctx, (tx) =>
      tx.customer.create({
        data: {
          tenantId,
          name,
          nameLower: name.toLowerCase(),
          phone,
          createdByUserId: owner.id,
          notes: 'Fictional demo customer',
        },
      }),
    );
    customers[name] = cust.id;
  }

  await money.opening(ctx, {
    account: 'CASH',
    amountPaise: 25_000_00,
    businessDate: yesterday,
    notes: 'Demo opening cash',
  });
  await money.opening(ctx, {
    account: 'FLOAT',
    amountPaise: 50_000_00,
    businessDate: yesterday,
    notes: 'Demo provider wallet balance',
  });

  const base = {
    customServiceId: null,
    assignedToUserId: null,
    followUpDate: null,
    clientRef: null,
    principalMethod: 'CASH' as const,
    post: true,
  };
  await records.create(ctx, {
    ...base,
    serviceCode: 'AEPS',
    customerId: customers['Ramesh Kumar'],
    walkInName: null,
    txnDate: yesterday,
    opStatus: 'SUCCESSFUL',
    principalPaise: 3_000_00,
    customerFeePaise: 10_00,
    expectedCommissionPaise: 7_50,
    paymentMethod: 'CASH',
    amountCollectedPaise: 10_00,
    externalRef: 'DEMO-RRN-000001',
    notes: null,
    details: { operationType: 'CASH_WITHDRAWAL', bankLabel: 'Demo Gramin Bank' },
  });
  await records.create(ctx, {
    ...base,
    serviceCode: 'DMT',
    customerId: customers['Sunita Devi'],
    walkInName: null,
    txnDate: yesterday,
    opStatus: 'SUCCESSFUL',
    principalPaise: 8_000_00,
    customerFeePaise: 80_00,
    expectedCommissionPaise: 16_00,
    paymentMethod: 'CASH',
    amountCollectedPaise: 8_080_00,
    externalRef: 'DEMO-UTR-000002',
    notes: null,
    details: {
      beneficiaryName: 'Rakesh (fictional)',
      bankName: 'Demo Bank',
      accountLast4: '4821',
      transferMode: 'IMPS',
    },
  });
  const due = await records.create(ctx, {
    ...base,
    serviceCode: 'BILL_PAYMENT',
    customerId: customers['Mohd. Arif'],
    walkInName: null,
    txnDate: today,
    opStatus: 'SUCCESSFUL',
    principalPaise: 1_450_00,
    customerFeePaise: 15_00,
    expectedCommissionPaise: 3_00,
    paymentMethod: 'CASH',
    amountCollectedPaise: 1_000_00,
    externalRef: 'DEMO-BBPS-000003',
    notes: 'Customer will pay the rest on Friday',
    details: {
      billCategory: 'ELECTRICITY',
      billerName: 'Demo Power Distribution Ltd',
      consumerId: 'DEMO123456',
      billDueDate: addDays(today, 5),
    },
  });
  await records.create(ctx, {
    ...base,
    serviceCode: 'PAN',
    customerId: customers['Priya Sharma'],
    walkInName: null,
    txnDate: today,
    opStatus: 'SUBMITTED',
    principalPaise: 107_00,
    customerFeePaise: 50_00,
    expectedCommissionPaise: 0,
    paymentMethod: 'UPI',
    amountCollectedPaise: 157_00,
    externalRef: null,
    notes: null,
    followUpDate: addDays(today, 7),
    details: {
      applicationType: 'NEW',
      applicantName: 'Priya Sharma',
      acknowledgmentNo: 'DEMO-ACK-000004',
      submittedOn: today,
    },
  });
  await records.create(ctx, {
    ...base,
    serviceCode: 'AEPS',
    customerId: null,
    walkInName: 'Walk-in (demo)',
    txnDate: today,
    opStatus: 'SUCCESSFUL',
    principalPaise: 0,
    customerFeePaise: 0,
    expectedCommissionPaise: 0,
    paymentMethod: 'NONE',
    amountCollectedPaise: 0,
    externalRef: null,
    notes: null,
    post: false,
    details: { operationType: 'BALANCE_ENQUIRY' },
  });
  await records.create(ctx, {
    ...base,
    serviceCode: 'AEPS',
    customerId: customers['Lakshmi Iyer'],
    walkInName: null,
    txnDate: today,
    opStatus: 'SUCCESSFUL',
    principalPaise: 5_000_00,
    customerFeePaise: 15_00,
    expectedCommissionPaise: 12_50,
    paymentMethod: 'CASH',
    amountCollectedPaise: 15_00,
    externalRef: 'DEMO-RRN-000006',
    notes: null,
    details: { operationType: 'CASH_WITHDRAWAL', bankLabel: 'Demo Cooperative Bank' },
  });
  await money.collect(ctx, {
    customerId: customers['Mohd. Arif'],
    method: 'CASH',
    receivedOn: today,
    notes: 'Partial payment (demo)',
    allocations: [{ recordId: due.id, amountPaise: 200_00 }],
  });
  await money.createExpense(ctx, {
    category: 'INTERNET',
    amountPaise: 599_00,
    method: 'BANK',
    paidOn: yesterday,
    vendor: 'Demo Broadband',
    notes: null,
  });

  await app.close();
  // eslint-disable-next-line no-console
  console.log(
    'Demo shop created. Sign in as demo.owner@example.test or demo.operator@example.test (codes in Mailpit at http://127.0.0.1:56626).',
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
