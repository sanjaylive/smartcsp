import { z } from 'zod';
import type { WorkflowType } from './status';
import { detectSensitiveNumber } from './privacy';
import { isIsoDate } from './dates';

/**
 * Service registry: the single description of every built-in service. It drives navigation,
 * quick actions, dashboard widgets, record forms and report filters on all clients, and the
 * API builds its validators from the same field definitions.
 */

export const SERVICE_CODES = [
  'RECHARGE',
  'DMT',
  'BILL_PAYMENT',
  'PAN',
  'AADHAAR',
  'DOCUMENT',
  'AEPS',
  'MICRO_ATM',
  'ACCOUNT_OPENING',
  'CUSTOM',
] as const;
export type ServiceCode = (typeof SERVICE_CODES)[number];

export type FieldType =
  'text' | 'number' | 'date' | 'select' | 'phone' | 'account' | 'ifsc' | 'checklist' | 'boolean';

export interface FieldOption {
  value: string;
  labelKey: string;
}

export interface FieldDef {
  key: string;
  type: FieldType;
  labelKey: string;
  required?: boolean;
  options?: FieldOption[];
  maxLength?: number;
  /** Masked in API responses unless the viewer has `customers.view_sensitive`. */
  sensitive?: boolean;
  /** Reject text that looks like an Aadhaar or card number. */
  guardSensitive?: boolean;
  helpKey?: string;
}

/**
 * How the transaction principal moves between the shop and the customer.
 * PAYOUT: shop hands principal to customer (e.g. AEPS cash withdrawal) and is credited by provider.
 * COLLECT: shop collects principal from customer and pays provider from its float (DMT, recharge).
 * NONE: no principal (enquiries, most applications).
 */
export type PrincipalDirection = 'PAYOUT' | 'COLLECT' | 'NONE';

export type Accent =
  'indigo' | 'violet' | 'teal' | 'blue' | 'amber' | 'coral' | 'green' | 'sky' | 'rose' | 'slate';

export interface ServiceDefinition {
  code: ServiceCode;
  labelKey: string;
  descriptionKey: string;
  category: 'PAYMENTS' | 'BANKING' | 'DOCUMENTS' | 'CUSTOM';
  workflowType: WorkflowType;
  /** Lucide icon name (web) — Flutter maps the same name to a Material icon. */
  icon: string;
  accent: Accent;
  principalLabelKey: string | null;
  fields: FieldDef[];
  /** Determines cash direction for the posting rules (see docs/FINANCE.md). */
  principalDirection: (details: Record<string, unknown>) => PrincipalDirection;
  dashboardWidgets: Array<'volume' | 'pendingApplications' | 'cashPayout' | 'cashCollected'>;
  /** Whether a provider connector could, in principle, execute this service. */
  providerCapable: boolean;
}

const opt = (values: string[], prefix: string): FieldOption[] =>
  values.map((v) => ({ value: v, labelKey: `${prefix}.${v}` }));

export const AEPS_OPERATIONS = [
  'CASH_WITHDRAWAL',
  'BALANCE_ENQUIRY',
  'MINI_STATEMENT',
  'CASH_DEPOSIT',
] as const;
export const MICRO_ATM_OPERATIONS = ['CASH_WITHDRAWAL', 'BALANCE_ENQUIRY'] as const;

const opDirection = (details: Record<string, unknown>): PrincipalDirection => {
  switch (details.operationType) {
    case 'CASH_WITHDRAWAL':
      return 'PAYOUT';
    case 'CASH_DEPOSIT':
      return 'COLLECT';
    default:
      return 'NONE';
  }
};

export const SERVICE_REGISTRY: Record<ServiceCode, ServiceDefinition> = {
  RECHARGE: {
    code: 'RECHARGE',
    labelKey: 'service.RECHARGE.name',
    descriptionKey: 'service.RECHARGE.description',
    category: 'PAYMENTS',
    workflowType: 'TRANSACTION',
    icon: 'smartphone',
    accent: 'teal',
    principalLabelKey: 'record.principal.recharge',
    fields: [
      {
        key: 'rechargeType',
        type: 'select',
        labelKey: 'field.rechargeType',
        required: true,
        options: opt(['PREPAID', 'DTH', 'FASTAG', 'DATACARD'], 'option.rechargeType'),
      },
      {
        key: 'operator',
        type: 'select',
        labelKey: 'field.operator',
        required: true,
        options: opt(
          [
            'AIRTEL',
            'JIO',
            'VI',
            'BSNL',
            'TATA_PLAY',
            'DISH_TV',
            'AIRTEL_DTH',
            'SUN_DIRECT',
            'D2H',
            'OTHER',
          ],
          'option.operator',
        ),
      },
      {
        key: 'subscriberNumber',
        type: 'text',
        labelKey: 'field.subscriberNumber',
        required: true,
        maxLength: 20,
        sensitive: true,
      },
      { key: 'circle', type: 'text', labelKey: 'field.circle', maxLength: 40 },
    ],
    principalDirection: () => 'COLLECT',
    dashboardWidgets: ['volume', 'cashCollected'],
    providerCapable: true,
  },
  DMT: {
    code: 'DMT',
    labelKey: 'service.DMT.name',
    descriptionKey: 'service.DMT.description',
    category: 'BANKING',
    workflowType: 'TRANSACTION',
    icon: 'send',
    accent: 'blue',
    principalLabelKey: 'record.principal.transfer',
    fields: [
      {
        key: 'senderName',
        type: 'text',
        labelKey: 'field.senderName',
        maxLength: 80,
        guardSensitive: true,
      },
      { key: 'senderMobile', type: 'phone', labelKey: 'field.senderMobile', sensitive: true },
      {
        key: 'beneficiaryName',
        type: 'text',
        labelKey: 'field.beneficiaryName',
        required: true,
        maxLength: 80,
        guardSensitive: true,
      },
      { key: 'bankName', type: 'text', labelKey: 'field.bankName', required: true, maxLength: 80 },
      {
        key: 'accountNumber',
        type: 'account',
        labelKey: 'field.accountNumber',
        required: true,
      },
      { key: 'ifsc', type: 'ifsc', labelKey: 'field.ifsc' },
      {
        key: 'transferMode',
        type: 'select',
        labelKey: 'field.transferMode',
        options: opt(['IMPS', 'NEFT', 'UPI'], 'option.transferMode'),
      },
    ],
    principalDirection: () => 'COLLECT',
    dashboardWidgets: ['volume', 'cashCollected'],
    providerCapable: true,
  },
  BILL_PAYMENT: {
    code: 'BILL_PAYMENT',
    labelKey: 'service.BILL_PAYMENT.name',
    descriptionKey: 'service.BILL_PAYMENT.description',
    category: 'PAYMENTS',
    workflowType: 'TRANSACTION',
    icon: 'receipt',
    accent: 'amber',
    principalLabelKey: 'record.principal.bill',
    fields: [
      {
        key: 'billCategory',
        type: 'select',
        labelKey: 'field.billCategory',
        required: true,
        options: opt(
          [
            'ELECTRICITY',
            'WATER',
            'GAS',
            'BROADBAND',
            'POSTPAID',
            'INSURANCE',
            'LOAN_EMI',
            'OTHER',
          ],
          'option.billCategory',
        ),
      },
      {
        key: 'billerName',
        type: 'text',
        labelKey: 'field.billerName',
        required: true,
        maxLength: 80,
      },
      {
        key: 'consumerId',
        type: 'text',
        labelKey: 'field.consumerId',
        required: true,
        maxLength: 30,
        sensitive: true,
      },
      { key: 'billDueDate', type: 'date', labelKey: 'field.billDueDate' },
    ],
    principalDirection: () => 'COLLECT',
    dashboardWidgets: ['volume', 'cashCollected'],
    providerCapable: true,
  },
  PAN: {
    code: 'PAN',
    labelKey: 'service.PAN.name',
    descriptionKey: 'service.PAN.description',
    category: 'DOCUMENTS',
    workflowType: 'APPLICATION',
    icon: 'id-card',
    accent: 'violet',
    principalLabelKey: 'record.principal.govtFee',
    fields: [
      {
        key: 'applicationType',
        type: 'select',
        labelKey: 'field.panApplicationType',
        required: true,
        options: opt(['NEW', 'CORRECTION', 'REPRINT', 'OTHER'], 'option.panApplicationType'),
      },
      {
        key: 'applicantName',
        type: 'text',
        labelKey: 'field.applicantName',
        required: true,
        maxLength: 80,
        guardSensitive: true,
      },
      { key: 'acknowledgmentNo', type: 'text', labelKey: 'field.acknowledgmentNo', maxLength: 40 },
      { key: 'submittedOn', type: 'date', labelKey: 'field.submittedOn' },
    ],
    principalDirection: () => 'COLLECT',
    dashboardWidgets: ['pendingApplications'],
    providerCapable: true,
  },
  AADHAAR: {
    code: 'AADHAAR',
    labelKey: 'service.AADHAAR.name',
    descriptionKey: 'service.AADHAAR.description',
    category: 'DOCUMENTS',
    workflowType: 'APPLICATION',
    icon: 'user-check',
    accent: 'coral',
    principalLabelKey: null,
    fields: [
      {
        key: 'serviceCategory',
        type: 'select',
        labelKey: 'field.aadhaarCategory',
        required: true,
        options: opt(
          [
            'ENROLMENT',
            'DEMOGRAPHIC_UPDATE',
            'BIOMETRIC_UPDATE',
            'DOCUMENT_UPDATE',
            'STATUS_CHECK',
            'OTHER',
          ],
          'option.aadhaarCategory',
        ),
      },
      {
        key: 'referenceNo',
        type: 'text',
        labelKey: 'field.appointmentReference',
        maxLength: 40,
        guardSensitive: true,
        helpKey: 'help.noAadhaarNumber',
      },
      { key: 'appointmentDate', type: 'date', labelKey: 'field.appointmentDate' },
    ],
    principalDirection: () => 'NONE',
    dashboardWidgets: ['pendingApplications'],
    providerCapable: false,
  },
  DOCUMENT: {
    code: 'DOCUMENT',
    labelKey: 'service.DOCUMENT.name',
    descriptionKey: 'service.DOCUMENT.description',
    category: 'DOCUMENTS',
    workflowType: 'APPLICATION',
    icon: 'files',
    accent: 'green',
    principalLabelKey: 'record.principal.govtFee',
    fields: [
      {
        key: 'documentCategory',
        type: 'select',
        labelKey: 'field.documentCategory',
        required: true,
        options: opt(
          [
            'INCOME_CERTIFICATE',
            'CASTE_CERTIFICATE',
            'RESIDENCE_CERTIFICATE',
            'BIRTH_CERTIFICATE',
            'DEATH_CERTIFICATE',
            'RATION_CARD',
            'VOTER_ID',
            'PASSPORT',
            'DRIVING_LICENCE',
            'SCHOLARSHIP',
            'PENSION',
            'OTHER',
          ],
          'option.documentCategory',
        ),
      },
      {
        key: 'department',
        type: 'text',
        labelKey: 'field.department',
        required: true,
        maxLength: 80,
      },
      { key: 'submissionRef', type: 'text', labelKey: 'field.submissionRef', maxLength: 40 },
      { key: 'checklist', type: 'checklist', labelKey: 'field.checklist' },
    ],
    principalDirection: () => 'COLLECT',
    dashboardWidgets: ['pendingApplications'],
    providerCapable: false,
  },
  AEPS: {
    code: 'AEPS',
    labelKey: 'service.AEPS.name',
    descriptionKey: 'service.AEPS.description',
    category: 'BANKING',
    workflowType: 'TRANSACTION',
    icon: 'hand-coins',
    accent: 'indigo',
    principalLabelKey: 'record.principal.aeps',
    fields: [
      {
        key: 'operationType',
        type: 'select',
        labelKey: 'field.operationType',
        required: true,
        options: opt([...AEPS_OPERATIONS], 'option.operationType'),
      },
      { key: 'bankLabel', type: 'text', labelKey: 'field.customerBank', maxLength: 80 },
      { key: 'providerName', type: 'text', labelKey: 'field.providerName', maxLength: 60 },
    ],
    principalDirection: opDirection,
    dashboardWidgets: ['volume', 'cashPayout'],
    providerCapable: true,
  },
  MICRO_ATM: {
    code: 'MICRO_ATM',
    labelKey: 'service.MICRO_ATM.name',
    descriptionKey: 'service.MICRO_ATM.description',
    category: 'BANKING',
    workflowType: 'TRANSACTION',
    icon: 'credit-card',
    accent: 'sky',
    principalLabelKey: 'record.principal.withdrawal',
    fields: [
      {
        key: 'operationType',
        type: 'select',
        labelKey: 'field.operationType',
        required: true,
        options: opt([...MICRO_ATM_OPERATIONS], 'option.operationType'),
      },
      { key: 'terminalRef', type: 'text', labelKey: 'field.terminalRef', maxLength: 40 },
      { key: 'providerName', type: 'text', labelKey: 'field.providerName', maxLength: 60 },
    ],
    principalDirection: opDirection,
    dashboardWidgets: ['volume', 'cashPayout'],
    providerCapable: true,
  },
  ACCOUNT_OPENING: {
    code: 'ACCOUNT_OPENING',
    labelKey: 'service.ACCOUNT_OPENING.name',
    descriptionKey: 'service.ACCOUNT_OPENING.description',
    category: 'BANKING',
    workflowType: 'APPLICATION',
    icon: 'landmark',
    accent: 'rose',
    principalLabelKey: null,
    fields: [
      { key: 'bankLabel', type: 'text', labelKey: 'field.bankName', required: true, maxLength: 80 },
      { key: 'productLabel', type: 'text', labelKey: 'field.productLabel', maxLength: 80 },
      {
        key: 'applicantName',
        type: 'text',
        labelKey: 'field.applicantName',
        required: true,
        maxLength: 80,
        guardSensitive: true,
      },
      { key: 'applicationRef', type: 'text', labelKey: 'field.applicationRef', maxLength: 40 },
      { key: 'submittedOn', type: 'date', labelKey: 'field.submittedOn' },
      {
        key: 'accountNumber',
        type: 'account',
        labelKey: 'field.accountNumber',
      },
    ],
    principalDirection: () => 'NONE',
    dashboardWidgets: ['pendingApplications'],
    providerCapable: false,
  },
  CUSTOM: {
    code: 'CUSTOM',
    labelKey: 'service.CUSTOM.name',
    descriptionKey: 'service.CUSTOM.description',
    category: 'CUSTOM',
    workflowType: 'TRANSACTION',
    icon: 'sparkles',
    accent: 'slate',
    principalLabelKey: 'record.principal.generic',
    fields: [],
    principalDirection: () => 'COLLECT',
    dashboardWidgets: ['volume'],
    providerCapable: false,
  },
};

export const SELECTABLE_SERVICES: ServiceCode[] = [...SERVICE_CODES];

// ---------------------------------------------------------------------------
// Custom service field definitions (bounded — no executable expressions)
// ---------------------------------------------------------------------------

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const;

export const customFieldDefSchema = z
  .object({
    key: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9]{0,29}$/,
        'Use letters and digits, starting with a lowercase letter',
      ),
    label: z.string().trim().min(1).max(40),
    type: z.enum(CUSTOM_FIELD_TYPES),
    required: z.boolean().default(false),
    options: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .refine((f) => f.type !== 'select' || (f.options && f.options.length > 0), {
    message: 'Select fields need at least one option',
    path: ['options'],
  });
export type CustomFieldDef = z.infer<typeof customFieldDefSchema>;

export const customFieldsSchema = z
  .array(customFieldDefSchema)
  .max(8)
  .refine((fs) => new Set(fs.map((f) => f.key)).size === fs.length, 'Field keys must be unique');

/** Converts custom field definitions into the registry FieldDef shape for rendering. */
export function customFieldsToFieldDefs(fields: CustomFieldDef[]): FieldDef[] {
  return fields.map((f) => ({
    key: f.key,
    type: f.type,
    labelKey: f.label, // custom labels are literal text, not translation keys
    required: f.required,
    options: f.options?.map((o) => ({ value: o, labelKey: o })),
    maxLength: f.type === 'text' ? 120 : undefined,
    guardSensitive: f.type === 'text',
  }));
}

// ---------------------------------------------------------------------------
// Validator built from field definitions — used by the API (authoritative) and clients.
// ---------------------------------------------------------------------------

function sensitiveGuard(s: string, ctx: z.RefinementCtx) {
  const kind = detectSensitiveNumber(s);
  if (kind) {
    ctx.addIssue({
      code: 'custom',
      message:
        kind === 'AADHAAR_NUMBER'
          ? 'Do not enter Aadhaar numbers. CSP2All does not store them.'
          : 'Do not enter card numbers. CSP2All does not store them.',
      params: { errorCode: 'SENSITIVE_DATA_REJECTED' },
    });
  }
}

function fieldSchema(f: FieldDef): z.ZodTypeAny {
  let s: z.ZodTypeAny;
  switch (f.type) {
    case 'text': {
      let t = z
        .string()
        .trim()
        .max(f.maxLength ?? 120);
      if (f.required) t = t.min(1, 'Required');
      s = f.guardSensitive ? t.superRefine(sensitiveGuard) : t;
      break;
    }
    case 'number':
      s = z.number().finite().min(0).max(1e12);
      break;
    case 'date':
      s = z.string().refine(isIsoDate, 'Use YYYY-MM-DD');
      break;
    case 'select':
      s = z.enum((f.options ?? []).map((o) => o.value) as [string, ...string[]]);
      break;
    case 'phone':
      s = z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number');
      break;
    case 'account':
      s = z
        .string()
        .transform((v) => v.replace(/[\s-]/g, ''))
        .pipe(z.string().regex(/^\d{9,18}$/, 'Enter the full account number (9–18 digits)'));
      break;
    case 'ifsc':
      s = z
        .string()
        .transform((v) => v.toUpperCase())
        .pipe(z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC'));
      break;
    case 'checklist':
      s = z
        .array(
          z.object({
            label: z.string().trim().min(1).max(60).superRefine(sensitiveGuard),
            done: z.boolean(),
          }),
        )
        .max(20);
      break;
    case 'boolean':
      s = z.boolean();
      break;
  }
  return f.required ? s : s.optional().nullable();
}

/** Strict validator: unknown keys are rejected so arbitrary data cannot be smuggled in. */
export function buildDetailsSchema(fields: FieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) shape[f.key] = fieldSchema(f);
  return z.object(shape).strict();
}

export function getService(code: string): ServiceDefinition | undefined {
  return (SERVICE_REGISTRY as Record<string, ServiceDefinition>)[code];
}
