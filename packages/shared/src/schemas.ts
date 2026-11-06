import { z } from 'zod';
import { MAX_PAISE } from './money';
import { isIsoDate } from './dates';
import { SERVICE_CODES } from './services';
import { OP_STATUSES } from './status';
import { PERMISSIONS } from './permissions';
import { detectSensitiveNumber } from './privacy';

// ----------------------------------------------------------------------------- primitives
export const paise = z.number().int('Must be whole paise').min(0).max(MAX_PAISE);
export const positivePaise = paise.refine((v) => v > 0, 'Must be greater than zero');
export const isoDate = z.string().refine(isIsoDate, 'Use YYYY-MM-DD');
export const uuid = z.uuid();
export const email = z
  .string()
  .trim()
  .max(254)
  .transform((e) => e.toLowerCase())
  .pipe(z.email('Enter a valid email address'));
export const indianMobile = z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number');

/** Free text that must not contain Aadhaar/card numbers. */
export const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .superRefine((s, ctx) => {
      if (detectSensitiveNumber(s))
        ctx.addIssue({
          code: 'custom',
          message: 'Remove Aadhaar or card numbers. CSP2All does not store them.',
          params: { errorCode: 'SENSITIVE_DATA_REJECTED' },
        });
    });

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const PAYMENT_METHODS = ['CASH', 'UPI', 'BANK', 'NONE'] as const;
export const FUND_ACCOUNTS = ['CASH', 'BANK', 'FLOAT'] as const;
export const LANGUAGES = ['en', 'hi'] as const;

// ----------------------------------------------------------------------------- auth
export const otpRequestSchema = z.object({
  email,
  consent: z.literal(true, { message: 'Please accept the terms and privacy notice' }),
});
export const otpVerifySchema = z.object({
  challengeId: uuid,
  email,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  client: z.enum(['web', 'mobile']).default('web'),
  deviceName: z.string().trim().max(80).optional(),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(32).max(200) });
export const selectTenantSchema = z.object({ tenantId: uuid });
export const totpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

// ----------------------------------------------------------------------------- onboarding & shop
export const shopSetupSchema = z.object({
  shopName: safeText(80).pipe(z.string().min(2, 'Enter your shop name')),
  ownerName: safeText(80).pipe(z.string().min(2, 'Enter your name')),
  contactPhone: indianMobile.optional().nullable(),
  state: z.string().trim().min(2).max(60),
  district: z.string().trim().min(2).max(60),
  address: safeText(240).optional().nullable(),
  preferredLanguage: z.enum(LANGUAGES).default('en'),
  timezone: z.string().max(60).default('Asia/Kolkata'),
});
export const onboardingServicesSchema = z.object({
  services: z
    .array(z.enum(SERVICE_CODES))
    .min(1, 'Select at least one service')
    .max(SERVICE_CODES.length),
});
export const shopProfileUpdateSchema = shopSetupSchema
  .omit({ ownerName: true })
  .partial()
  .extend({
    version: z.number().int(),
    brandColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional()
      .nullable(),
    receiptFooter: safeText(200).optional().nullable(),
  });

// ----------------------------------------------------------------------------- customers
export const FOLLOW_UP_PREFS = ['NONE', 'CALL', 'SMS', 'WHATSAPP', 'VISIT'] as const;
export const customerCreateSchema = z.object({
  name: safeText(80).pipe(z.string().min(1, 'Enter a name')),
  phone: indianMobile.optional().nullable(),
  email: email.optional().nullable(),
  notes: safeText(1000).optional().nullable(),
  followUpPreference: z.enum(FOLLOW_UP_PREFS).default('NONE'),
});
export const customerUpdateSchema = customerCreateSchema
  .partial()
  .extend({ version: z.number().int() });
export const customerListQuery = pagination.extend({
  q: z.string().trim().max(80).optional(),
  archived: z.enum(['true', 'false']).optional(),
});

// ----------------------------------------------------------------------------- records
/** Unrefined base (Zod forbids omit/extend on refined schemas). */
export const recordCreateBase = z.object({
  serviceCode: z.enum(SERVICE_CODES),
  customServiceId: uuid.optional().nullable(),
  customerId: uuid.optional().nullable(),
  walkInName: safeText(80).optional().nullable(),
  txnDate: isoDate,
  opStatus: z.enum(OP_STATUSES),
  principalPaise: paise.default(0),
  customerFeePaise: paise.default(0),
  expectedCommissionPaise: paise.default(0),
  paymentMethod: z.enum(PAYMENT_METHODS).default('CASH'),
  amountCollectedPaise: paise.default(0),
  /** How the principal moved for PAYOUT/COLLECT services. */
  principalMethod: z.enum(['CASH', 'UPI', 'BANK']).default('CASH'),
  externalRef: z.string().trim().max(60).optional().nullable(),
  assignedToUserId: uuid.optional().nullable(),
  notes: safeText(1000).optional().nullable(),
  followUpDate: isoDate.optional().nullable(),
  details: z.record(z.string(), z.unknown()).default({}),
  /** Explicitly post the recorded cash movement to the cashbook. */
  post: z.boolean().default(false),
  /** Client-generated id (mobile offline drafts) for duplicate prevention. */
  clientRef: z.string().trim().min(8).max(64).optional().nullable(),
});

export const collectedNeedsMethod = <
  T extends { amountCollectedPaise: number; paymentMethod: string },
>(
  r: T,
) => r.amountCollectedPaise === 0 || r.paymentMethod !== 'NONE';

export const recordCreateSchema = recordCreateBase.refine(collectedNeedsMethod, {
  message: 'Choose how the amount was collected',
  path: ['paymentMethod'],
});

export const recordUpdateSchema = z.object({
  version: z.number().int(),
  customerId: uuid.optional().nullable(),
  walkInName: safeText(80).optional().nullable(),
  txnDate: isoDate.optional(),
  principalPaise: paise.optional(),
  customerFeePaise: paise.optional(),
  expectedCommissionPaise: paise.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  amountCollectedPaise: paise.optional(),
  principalMethod: z.enum(['CASH', 'UPI', 'BANK']).optional(),
  externalRef: z.string().trim().max(60).optional().nullable(),
  assignedToUserId: uuid.optional().nullable(),
  notes: safeText(1000).optional().nullable(),
  followUpDate: isoDate.optional().nullable(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const recordTransitionSchema = z.object({
  version: z.number().int(),
  to: z.enum(OP_STATUSES),
  reason: safeText(500).optional().nullable(),
  /**
   * Required when moving a POSTED record to FAILED/CANCELLED: true reverses its cash entries in
   * the same operation, false keeps them (e.g. a fee that is not refunded). Omitted => 409.
   */
  reversePosting: z.boolean().optional(),
});
export const recordPostSchema = z.object({ version: z.number().int() });
export const recordReverseSchema = z.object({
  version: z.number().int(),
  reason: safeText(500).pipe(z.string().min(3, 'Give a reason')),
});
export const recordListQuery = pagination.extend({
  service: z.enum(SERVICE_CODES).optional(),
  customServiceId: uuid.optional(),
  status: z.enum(OP_STATUSES).optional(),
  paymentStatus: z.enum(['NOT_APPLICABLE', 'UNPAID', 'PARTIAL', 'PAID']).optional(),
  customerId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(60).optional(),
  mine: z.enum(['true', 'false']).optional(),
});
export const postingPreviewSchema = recordCreateSchema;

// ----------------------------------------------------------------------------- follow-ups
export const followUpCreateSchema = z.object({
  title: safeText(120).pipe(z.string().min(2)),
  dueDate: isoDate,
  recordId: uuid.optional().nullable(),
  customerId: uuid.optional().nullable(),
  assignedToUserId: uuid.optional().nullable(),
  notes: safeText(500).optional().nullable(),
});
export const followUpUpdateSchema = z.object({
  version: z.number().int(),
  status: z.enum(['OPEN', 'DONE', 'CANCELLED']).optional(),
  dueDate: isoDate.optional(),
  title: safeText(120).optional(),
  notes: safeText(500).optional().nullable(),
  assignedToUserId: uuid.optional().nullable(),
});

// ----------------------------------------------------------------------------- money movements
export const collectionCreateSchema = z.object({
  customerId: uuid.optional().nullable(),
  method: z.enum(['CASH', 'UPI', 'BANK']),
  receivedOn: isoDate,
  notes: safeText(500).optional().nullable(),
  allocations: z
    .array(z.object({ recordId: uuid, amountPaise: positivePaise }))
    .min(1, 'Allocate the amount to at least one record')
    .max(50),
});

export const EXPENSE_CATEGORIES = [
  'RENT',
  'ELECTRICITY',
  'INTERNET',
  'SALARY',
  'STATIONERY',
  'TRAVEL',
  'MAINTENANCE',
  'PROVIDER_CHARGES',
  'OTHER',
] as const;
export const expenseCreateSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amountPaise: positivePaise,
  method: z.enum(FUND_ACCOUNTS),
  paidOn: isoDate,
  vendor: safeText(80).optional().nullable(),
  notes: safeText(500).optional().nullable(),
});
export const collectionReverseSchema = z.object({ reason: safeText(300).pipe(z.string().min(3)) });
export const expenseReverseSchema = z.object({ reason: safeText(300).pipe(z.string().min(3)) });

export const openingBalanceSchema = z.object({
  account: z.enum(FUND_ACCOUNTS),
  amountPaise: paise,
  businessDate: isoDate,
  notes: safeText(300).optional().nullable(),
});
export const cashAdjustmentSchema = z.object({
  account: z.enum(FUND_ACCOUNTS),
  direction: z.enum(['IN', 'OUT']),
  amountPaise: positivePaise,
  businessDate: isoDate,
  reason: safeText(300).pipe(z.string().min(3, 'Give a reason')),
});
export const fundTransferSchema = z
  .object({
    from: z.enum(FUND_ACCOUNTS),
    to: z.enum(FUND_ACCOUNTS),
    amountPaise: positivePaise,
    businessDate: isoDate,
    notes: safeText(300).optional().nullable(),
  })
  .refine((t) => t.from !== t.to, { message: 'Choose two different accounts', path: ['to'] });

export const commissionReceiptSchema = z.object({
  method: z.enum(FUND_ACCOUNTS),
  receivedOn: isoDate,
  allocations: z
    .array(z.object({ recordId: uuid, amountPaise: positivePaise }))
    .max(200)
    .default([]),
  unallocatedPaise: paise.default(0),
  notes: safeText(300).optional().nullable(),
});

export const closingCreateSchema = z.object({
  businessDate: isoDate,
  countedCashPaise: paise,
  notes: safeText(500).optional().nullable(),
});
export const reopenRequestSchema = z.object({
  reason: safeText(500).pipe(z.string().min(5, 'Give a reason')),
});

// ----------------------------------------------------------------------------- staff & settings
export const staffInviteSchema = z.object({
  email,
  displayName: safeText(80).pipe(z.string().min(1)),
  role: z.enum(['MANAGER', 'OPERATOR', 'ACCOUNTANT']),
  grants: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).default([]),
  revokes: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).default([]),
});
export const staffUpdateSchema = z.object({
  version: z.number().int(),
  role: z.enum(['MANAGER', 'OPERATOR', 'ACCOUNTANT']).optional(),
  grants: z.array(z.enum(PERMISSIONS)).optional(),
  revokes: z.array(z.enum(PERMISSIONS)).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});
export const serviceToggleSchema = z.object({ enabled: z.boolean() });

export const customServiceCreateSchema = z.object({
  name: safeText(60).pipe(z.string().min(2)),
  category: safeText(40).pipe(z.string().min(2)),
  workflowType: z.enum(['TRANSACTION', 'APPLICATION']),
  defaultFeePaise: paise.default(0),
  principalDirection: z.enum(['COLLECT', 'PAYOUT', 'NONE']).default('NONE'),
  fields: z.array(z.unknown()).max(8).default([]),
});
export const customServiceUpdateSchema = customServiceCreateSchema.partial().extend({
  version: z.number().int(),
  active: z.boolean().optional(),
});

export const EXPORT_TYPES = ['RECORDS', 'CUSTOMERS', 'DUES', 'LEDGER', 'EXPENSES'] as const;
export const exportCreateSchema = z.object({
  type: z.enum(EXPORT_TYPES),
  from: isoDate.optional(),
  to: isoDate.optional(),
  serviceCode: z.enum(SERVICE_CODES).optional(),
});

export const reportRangeQuery = z.object({ from: isoDate, to: isoDate });

// ----------------------------------------------------------------------------- subscription
export const BILLING_CYCLES = ['MONTHLY', 'ANNUAL'] as const;
export const paymentSubmissionSchema = z.object({
  planCode: z.string().min(2).max(30),
  billingCycle: z.enum(BILLING_CYCLES),
  method: z.enum(['UPI', 'BANK_TRANSFER', 'CASH', 'CHEQUE']),
  payerReference: z.string().trim().min(3).max(60),
  paidOn: isoDate,
  amountPaise: positivePaise,
  notes: safeText(300).optional().nullable(),
});

// ----------------------------------------------------------------------------- integrations
export const connectorConfigSchema = z.object({
  mode: z.enum(['DISABLED', 'SIMULATOR']),
  /** Credentials are write-only: accepted here, never returned (only masked). */
  credentials: z.record(z.string(), z.string().max(500)).optional(),
  enabledServices: z.array(z.enum(SERVICE_CODES)).default([]),
});
export const providerOperationSchema = z.object({
  recordId: uuid,
  operationType: z.enum(['EXECUTE']),
  /** Confirmation of the details shown to the operator before an external operation. */
  confirmed: z.literal(true),
});

// ----------------------------------------------------------------------------- admin
export const entitlementsSchema = z.object({
  staffLimit: z.number().int().min(1).nullable(),
  monthlyRecordLimit: z.number().int().min(0).nullable(),
  enabledServiceLimit: z.number().int().min(1).nullable(),
  customServiceLimit: z.number().int().min(0),
  storageLimitMb: z.number().int().min(0),
  exportsEnabled: z.boolean(),
  advancedReports: z.boolean(),
  customBranding: z.boolean(),
  connectorEligible: z.boolean(),
});
export type Entitlements = z.infer<typeof entitlementsSchema>;

export const planVersionCreateSchema = z.object({
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(300).optional().nullable(),
  monthlyPricePaise: paise,
  annualPricePaise: paise,
  currency: z.literal('INR').default('INR'),
  taxRateBps: z.number().int().min(0).max(5000),
  taxInclusive: z.boolean().default(false),
  trialDays: z.number().int().min(0).max(90).default(0),
  graceDays: z.number().int().min(0).max(60).default(7),
  entitlements: entitlementsSchema,
  /** How existing subscribers on older versions are treated. */
  existingSubscribers: z.enum(['KEEP_CURRENT_VERSION', 'MIGRATE_AT_RENEWAL', 'MIGRATE_NOW']),
});
export const paymentReviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().trim().max(300).optional().nullable(),
});
export const tenantStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().trim().min(5).max(300),
});
export const subscriptionChangeSchema = z.object({
  planCode: z.string().min(2).max(30),
  billingCycle: z.enum(BILLING_CYCLES),
  effective: z.enum(['NOW', 'PERIOD_END']),
  reason: z.string().trim().min(3).max(300),
});
export const entitlementOverrideSchema = z.object({
  key: z.enum([
    'staffLimit',
    'monthlyRecordLimit',
    'enabledServiceLimit',
    'customServiceLimit',
    'storageLimitMb',
    'exportsEnabled',
    'advancedReports',
    'customBranding',
    'connectorEligible',
  ]),
  value: z.union([z.number().int().min(0), z.boolean(), z.null()]),
  reason: z.string().trim().min(3).max(300),
  expiresAt: z.iso.datetime().optional().nullable(),
});
export const supportSessionSchema = z.object({
  tenantId: uuid,
  reason: z.string().trim().min(10).max(500),
  durationMinutes: z.number().int().min(5).max(120).default(30),
});
export const announcementSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(2000),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).default('INFO'),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().optional().nullable(),
});
export const platformSettingSchema = z.object({ value: z.unknown() });
export const adminCreateSchema = z.object({ email, role: z.enum(['SUPER_ADMIN', 'SUPPORT']) });
export const adminUpdateSchema = z.object({
  role: z.enum(['SUPER_ADMIN', 'SUPPORT']).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});
export const catalogUpdateSchema = z.object({ platformEnabled: z.boolean() });
