import type {
  Entitlements,
  OpStatus,
  PaymentStatus,
  PostingStatus,
  ServiceCode,
  WorkflowType,
} from '@csp2all/shared';

/** Response shapes of the CSP2All API (source of truth: apps/api controllers). */

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface MeTenant {
  tenantId: string;
  name: string;
  role: string;
  status: string;
  tenantStatus: string;
  district: string | null;
  state: string | null;
}

export interface Me {
  user: {
    id: string;
    email: string | null;
    phone?: string | null;
    displayName: string | null;
    locale: string | null;
  };
  activeTenantId: string | null;
  tenants: MeTenant[];
  onboarding: { step: string } | null;
  csrfToken?: string;
}

export interface OtpChallenge {
  challengeId: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export interface TenantProfile {
  id: string;
  name: string;
  ownerDisplayName: string;
  status: string;
  statusReason: string | null;
  contactPhone: string | null;
  contactPhoneVerified: boolean;
  state: string | null;
  district: string | null;
  address: string | null;
  preferredLanguage: 'en' | 'hi';
  timezone: string;
  brandColor: string | null;
  receiptFooter: string | null;
  logoAttachmentId: string | null;
  createdAt: string;
  version: number;
}

export type UnavailableReason = 'PLATFORM' | 'TENANT' | 'PLAN' | 'PERMISSION';

export interface ServiceAvailability {
  code: ServiceCode;
  platformEnabled: boolean;
  selected: boolean;
  withinPlan: boolean;
  canCreate: boolean;
  hasHistory: boolean;
  reason: UnavailableReason | null;
  workflowType: WorkflowType;
  providerExecution: { available: boolean; reason: string | null };
}

export interface CustomFieldDefJson {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  required: boolean;
  options?: string[];
}

export interface CustomService {
  id: string;
  name: string;
  category: string;
  workflowType: WorkflowType;
  principalDirection: 'COLLECT' | 'PAYOUT' | 'NONE';
  defaultFeePaise: number;
  fields: CustomFieldDefJson[];
  active: boolean;
  version: number;
}

export interface Usage {
  periodKey: string;
  periodTimezone: string;
  recordsThisPeriod: number;
  staff: number;
  enabledServices: number;
  customServices: number;
  storageBytes: number;
}

export interface TenantContext {
  tenant: TenantProfile;
  membership: { role: string; permissions: string[] };
  services: ServiceAvailability[];
  customServices: CustomService[];
  navigation: { key: string; path: string }[];
  serviceNavigation: {
    code: ServiceCode;
    path: string;
    canCreate: boolean;
    reason: UnavailableReason | null;
  }[];
  quickActions: { code: ServiceCode; path: string }[];
  dashboardWidgets: string[];
  plan: {
    code: string;
    name: string;
    status: string;
    fallback: boolean;
    entitlements: Entitlements;
  };
  usage: Usage;
  supportAccessActive: { id: string; reason: string; startedAt: string; expiresAt: string }[];
  announcements: {
    id: string;
    title: string;
    body: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
  }[];
  unreadNotifications: number;
}

export interface RecordJson {
  id: string;
  recordNo: number;
  serviceCode: ServiceCode;
  customServiceId: string | null;
  workflowType: WorkflowType;
  principalDirection: 'PAYOUT' | 'COLLECT' | 'NONE';
  customerId: string | null;
  customer: { id: string; name: string } | null;
  walkInName: string | null;
  txnDate: string;
  principalPaise: number;
  customerFeePaise: number;
  expectedCommissionPaise: number;
  receivedCommissionPaise: number;
  paymentMethod: string;
  principalMethod: string;
  amountCollectedPaise: number;
  amountAllocatedPaise: number;
  amountDuePaise: number;
  receivablePaise: number;
  externalRef: string | null;
  assignedToUserId: string | null;
  notes: string | null;
  followUpDate: string | null;
  details: Record<string, unknown>;
  source: 'MANUAL' | 'MOBILE_SYNC' | 'PROVIDER';
  isManual: boolean;
  opStatus: OpStatus;
  paymentStatus: PaymentStatus;
  postingStatus: PostingStatus;
  connectorStatus: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface JournalLineJson {
  account: string;
  accountName: string;
  debitPaise: number;
  creditPaise: number;
  memo: string | null;
}

export interface RecordDetail extends RecordJson {
  allowedTransitions: OpStatus[];
  events: {
    id: string;
    dimension: string;
    fromStatus: string | null;
    toStatus: string | null;
    reason: string | null;
    data: unknown;
    actorType: string;
    createdAt: string;
  }[];
  allocations: {
    id: string;
    amountPaise: number;
    collectionId: string;
    receiptNo: number;
    method: string;
    receivedOn: string;
    reversed: boolean;
  }[];
  attachments: {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    scanStatus: string;
    createdAt: string;
  }[];
  followUps: { id: string; title: string; dueDate: string; status: string; version: number }[];
  journal: {
    id: string;
    entryNo: number;
    type: string;
    businessDate: string;
    description: string;
    reversedByEntryId: string | null;
    lines: JournalLineJson[];
  }[];
}

export interface PostingPreview {
  direction: 'PAYOUT' | 'COLLECT' | 'NONE';
  receivablePaise: number;
  amountDuePaise: number;
  cashEffectPaise: number;
  lines: JournalLineJson[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  phoneMasked: boolean;
  notes: string | null;
  followUpPreference: string;
  archivedAt: string | null;
  createdAt: string;
  version: number;
  outstandingDuePaise?: number;
}

export interface CustomerDetail extends Customer {
  outstandingDuePaise: number;
  history: {
    id: string;
    recordNo: number;
    serviceCode: ServiceCode;
    txnDate: string;
    opStatus: OpStatus;
    principalPaise: number;
    customerFeePaise: number;
    amountDuePaise: number;
    paymentStatus: PaymentStatus;
    postingStatus: PostingStatus;
  }[];
  followUps: { id: string; title: string; dueDate: string; status: string }[];
}

export interface FollowUp {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string;
  status: 'OPEN' | 'DONE' | 'CANCELLED';
  recordId: string | null;
  customer: { id: string; name: string } | null;
  assignedToUserId: string | null;
  completedAt: string | null;
  version: number;
}

export interface DueGroup {
  customerId: string | null;
  customerName: string;
  totalDuePaise: number;
  records: {
    id: string;
    recordNo: number;
    serviceCode: ServiceCode;
    txnDate: string;
    amountDuePaise: number;
    paymentStatus: PaymentStatus;
  }[];
}

export interface CollectionJson {
  id: string;
  receiptNo: number;
  customerId: string | null;
  method: string;
  amountPaise: number;
  receivedOn: string;
  notes: string | null;
  reversedAt: string | null;
  allocations: { recordId: string; recordNo: number; amountPaise: number }[];
}

export interface Cashbook {
  date: string;
  account: 'CASH' | 'BANK' | 'FLOAT';
  openingBalancePaise: number;
  totalInPaise: number;
  totalOutPaise: number;
  closingBalancePaise: number;
  items: {
    entryId: string;
    entryNo: number;
    type: string;
    description: string;
    sourceType: string;
    sourceId: string | null;
    inPaise: number;
    outPaise: number;
    balancePaise: number;
    memo: string | null;
    reversed: boolean;
    isReversal: boolean;
    createdAt: string;
  }[];
  fundBalances: { account: string; name: string; balancePaise: number }[];
  dayStatus: string;
}

export interface Expense {
  id: string;
  category: string;
  amountPaise: number;
  method: string;
  paidOn: string;
  vendor: string | null;
  notes: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  createdAt: string;
}

export interface Commissions {
  pendingPaise: number;
  receivedToDatePaise: number;
  outstanding: {
    id: string;
    recordNo: number;
    serviceCode: ServiceCode;
    txnDate: string;
    expectedPaise: number;
    receivedPaise: number;
    outstandingPaise: number;
  }[];
  receipts: {
    id: string;
    method: string;
    amountPaise: number;
    receivedOn: string;
    notes: string | null;
    allocations: { recordId: string; amountPaise: number }[];
  }[];
}

export interface Closing {
  id: string;
  businessDate: string;
  status: 'CLOSED' | 'REOPEN_REQUESTED' | 'REOPENED';
  openingCashPaise: number;
  cashInPaise: number;
  cashOutPaise: number;
  expectedCashPaise: number;
  countedCashPaise: number;
  variancePaise: number;
  notes: string | null;
  summary: ClosingSummary | null;
  closedAt: string | null;
  reopenReason: string | null;
  reopenedAt: string | null;
  closeCount: number;
  version: number;
}

export interface ClosingSummary {
  recordsTotal: number;
  recordsUnposted: number;
  feeIncomePaise: number;
  commissionAccruedPaise: number;
  expensesPaise: number;
  bankNetPaise: number;
  walletNetPaise: number;
  duesCollectedPaise: number;
}

export interface ClosingPreview {
  businessDate: string;
  status: string;
  openingCashPaise: number;
  cashInPaise: number;
  cashOutPaise: number;
  expectedCashPaise: number;
  summary: ClosingSummary;
  closing: Closing | null;
}

interface Metric {
  value: number;
  range?: { from: string; to: string };
  asOf?: string;
  meaning: string;
}

export interface Dashboard {
  date: string;
  timezone: string;
  scope: 'SHOP' | 'MY_RECORDS';
  todayRecords: Metric;
  serviceVolume: {
    range: { from: string; to: string };
    meaning: string;
    items: {
      serviceCode: ServiceCode;
      count: number;
      principalPaise: number;
      customerFeePaise: number;
    }[];
  };
  pendingApplications: Metric;
  financial: {
    customerFeesPaise: Metric;
    cashInPaise: Metric;
    cashOutPaise: Metric;
    cashInHandPaise: Metric;
    outstandingDuesPaise: Metric;
    pendingCommissionPaise: Metric;
  } | null;
  recentActivity: {
    id: string;
    recordNo: number;
    serviceCode: ServiceCode;
    customerName: string | null;
    txnDate: string;
    opStatus: OpStatus;
    principalPaise: number;
    customerFeePaise: number;
    postingStatus: PostingStatus;
    createdAt: string;
  }[];
  followUpsDue: {
    id: string;
    title: string;
    dueDate: string;
    customerName: string | null;
    recordId: string | null;
    version: number;
  }[];
  checklist: {
    firstCustomer: boolean;
    firstRecord: boolean;
    openingCash: boolean;
    staffInvited: boolean | null;
  };
}

export interface ReportSummary {
  range: { from: string; to: string };
  notes: string[];
  income: {
    customerFeesPaise: number;
    commissionAccruedPaise: number;
    expensesPaise: number;
    cashOverShortPaise: number;
    netIncomePaise: number;
  };
  commission: {
    accruedInRangePaise: number;
    receivedInRangePaise: number;
    pendingAsOfEndPaise: number;
  };
  funds: {
    account: 'CASH' | 'BANK' | 'FLOAT';
    inPaise: number;
    outPaise: number;
    closingBalancePaise: number;
  }[];
  duesOutstandingAsOfEndPaise: number;
  openingCapitalPaise: number;
  services: {
    serviceCode: ServiceCode;
    postedRecords: number;
    transactionValuePaise: number;
    customerFeesPaise: number;
    expectedCommissionPaise: number;
  }[];
}

export interface ExportJob {
  id: string;
  type: string;
  params: Record<string, unknown>;
  status: 'QUEUED' | 'RUNNING' | 'READY' | 'FAILED' | 'EXPIRED';
  rowCount: number | null;
  error: string | null;
  expiresAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface StaffMember {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  grants: string[];
  revokes: string[];
  permissions: string[];
  lastLoginAt: string | null;
  isSelf: boolean;
  version: number;
}

export interface PlanVersionJson {
  id: string;
  planCode?: string;
  version: number;
  name: string;
  description: string | null;
  monthlyPricePaise: number;
  annualPricePaise: number;
  currency: string;
  taxRateBps: number;
  taxInclusive: boolean;
  trialDays: number;
  graceDays: number;
  entitlements: Entitlements;
  isDemoDefault: boolean;
}

export interface Quote {
  basePaise: number;
  taxPaise: number;
  totalPaise: number;
  taxInclusive: boolean;
  taxRateBps: number;
}

export interface PlanListItem {
  code: string;
  isDefault: boolean;
  current: PlanVersionJson;
  quotes: { MONTHLY: Quote; ANNUAL: Quote };
}

export interface PaymentSubmission {
  id: string;
  planVersionId: string;
  billingCycle: string;
  method: string;
  payerReference: string;
  paidOn: string;
  amountPaise: number;
  expectedPaise: number;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  reviewNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface SubscriptionInfo {
  subscription: {
    status: string;
    billingCycle: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    graceEndsAt: string | null;
    scheduledChange: { planCode: string; name: string; at: string } | null;
  };
  plan: PlanVersionJson;
  effective: {
    planCode: string;
    entitlements: Entitlements;
    overrides: { key: string; value: unknown; expiresAt: string | null }[];
    fallback: boolean;
  };
  usage: Usage;
  historyPolicy: string;
  events: { id: string; type: string; data: unknown; actorType: string; createdAt: string }[];
  paymentSubmissions: PaymentSubmission[];
}

export interface NotificationJson {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface SessionJson {
  id: string;
  kind: string;
  deviceName: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface AuditEvent {
  id: string;
  action: string;
  actorType: string;
  actor: string;
  targetType: string | null;
  targetId: string | null;
  data: unknown;
  supportSessionId: string | null;
  createdAt: string;
}

export interface IntegrationsOverview {
  providers: {
    provider: string;
    mode: 'DISABLED' | 'SIMULATOR';
    liveAvailable: boolean;
    liveUnavailableReason: string;
    missing: unknown;
    simulatorAvailable: boolean;
    credentialsMasked: Record<string, string> | null;
    keyVersion: number | null;
    enabledServices: ServiceCode[];
    supportedServices: ServiceCode[];
    lastHealthAt: string | null;
    lastHealthStatus: string | null;
    version: number;
  }[];
  planAllowsConnector: boolean;
  notice: string;
}

export interface OnboardingState {
  step: 'SHOP' | 'SERVICES' | 'DONE' | string;
  shop: Record<string, unknown> | null;
  services: ServiceCode[];
  completedTenantId: string | null;
  availableServices: ServiceCode[];
  startingPlan: { name: string; enabledServiceLimit: number | null };
}

export interface SignedUrl {
  url: string;
  expiresAt?: string;
}
