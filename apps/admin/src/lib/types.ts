import type { Entitlements, PlatformPermission, PlatformRole } from '@csp2all/shared';

/** Response shapes of the admin API (source of truth: apps/api/src/modules/admin/*.ts). */

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface AdminMe {
  userId: string;
  email: string;
  role: PlatformRole;
  permissions: PlatformPermission[];
  mfaEnrolled: boolean;
  mfaVerified: boolean;
}

export interface Overview {
  tenants: Record<string, number>;
  subscriptionsByPlan: Record<string, number>;
  users: number;
  newTenants30d: number;
  records30d: number;
  pendingPayments: number;
  failedEmails24h: number;
  failedOutbox: number;
  openReconciliationExceptions: number;
  activeSupportSessions: number;
  queues: Record<string, number>;
}

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_DELETION';

export interface TenantRow {
  id: string;
  name: string;
  ownerDisplayName: string;
  district: string;
  state: string;
  status: TenantStatus;
  plan: string | null;
  subscriptionStatus: string | null;
  createdAt: string;
}

export interface Subscription {
  id: string;
  tenantId: string;
  planVersionId: string;
  status: string;
  billingCycle: string;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  scheduledPlanVersionId: string | null;
  scheduledBillingCycle: string | null;
  scheduledChangeAt: string | null;
  planCode: string;
  planName: string;
  [k: string]: unknown;
}

export interface Override {
  id: string;
  key: keyof Entitlements;
  value: number | boolean | null;
  reason: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface SupportSession {
  id: string;
  adminUserId: string;
  tenantId: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
  endedBy: string | null;
}

export interface TenantDetail {
  tenant: {
    id: string;
    name: string;
    ownerDisplayName: string;
    status: TenantStatus;
    statusReason: string | null;
    state: string;
    district: string;
    contactPhone: string | null;
    contactPhoneVerified: boolean;
    timezone: string;
    createdAt: string;
  };
  members: {
    id: string;
    userId: string;
    email: string;
    role: string;
    status: string;
    lastLoginAt: string | null;
  }[];
  services: { code: string; enabled: boolean }[];
  subscription: Subscription | null;
  entitlements: Entitlements;
  overrides: Override[];
  usage: {
    periodKey: string;
    periodTimezone: string;
    recordsThisPeriod: number;
    staff: number;
    enabledServices: number;
    customServices: number;
    storageBytes: number;
  };
  subscriptionEvents: {
    id: string;
    type: string;
    actorType: string | null;
    data: unknown;
    createdAt: string;
  }[];
  connector: {
    mode: string;
    enabledServices: string[];
    credentialsMasked: unknown;
    lastHealthStatus: string | null;
    lastHealthAt: string | null;
  } | null;
  supportSessions: SupportSession[];
}

export interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  status: 'ACTIVE' | 'DISABLED';
  lastLoginAt: string | null;
  createdAt: string;
  platformRole: PlatformRole | null;
  memberships: { tenantId: string; tenantName: string; role: string; status: string }[];
}

export type ExistingSubscribersPolicy =
  'KEEP_CURRENT_VERSION' | 'MIGRATE_AT_RENEWAL' | 'MIGRATE_NOW';

export interface PlanVersion {
  id: string;
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
  existingSubscribers: ExistingSubscribersPolicy;
  isDemoDefault: boolean;
  createdAt: string;
  subscribers: number;
}

export interface Plan {
  id: string;
  code: string;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  currentVersionId: string | null;
  versions: PlanVersion[];
}

export interface PaymentSubmission {
  id: string;
  tenantId: string;
  tenantName?: string;
  planCode?: string;
  planName?: string;
  billingCycle: string;
  method: string;
  payerReference: string;
  paidOn: string | null;
  amountPaise: number;
  expectedPaise: number;
  amountMatches: boolean;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  notes: string | null;
  reviewNotes: string | null;
  proofs: { id: string; ownerId: string; fileName: string }[];
  createdAt: string;
  version: number;
}

export interface CatalogService {
  code: string;
  name: string;
  category: string;
  workflowType: string;
  platformEnabled: boolean;
  providerCapable: boolean;
  sortOrder: number;
  updatedAt: string;
  enabledTenants: number;
}

export interface ConnectorsResponse {
  configs: {
    id: string;
    tenantId: string;
    provider: string;
    mode: string;
    enabledServices: string[];
    credentialsMasked: unknown;
    keyVersion: number | null;
    lastHealthAt: string | null;
    lastHealthStatus: string | null;
  }[];
  operationsByStatus: Record<string, number>;
  openExceptions: {
    id: string;
    tenantId: string;
    runId: string;
    operationId: string | null;
    kind: string;
    details: unknown;
    createdAt: string;
  }[];
  recentWebhooks: {
    id: string;
    provider: string;
    deliveryId: string;
    signatureValid: boolean;
    status: string;
    error: string | null;
    receivedAt: string;
  }[];
  pay2all: { liveAvailable: boolean; reason: string };
}

export interface EmailLog {
  id: string;
  toMasked: string;
  template: string;
  status: string;
  providerMessageId: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  sentAt: string | null;
  [k: string]: unknown;
}

export interface JobsResponse {
  queues: Record<string, number>;
  failedJobs: {
    id: string;
    name: string;
    failedReason?: string;
    attemptsMade: number;
    timestamp: string;
    tenantId: string | null;
  }[];
  failedOutbox: {
    id: string;
    tenantId: string | null;
    type: string;
    attempts: number;
    lastError: string | null;
    createdAt: string;
  }[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  actorType: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  data: unknown;
  requestId: string | null;
  supportSessionId?: string | null;
  createdAt: string;
  [k: string]: unknown;
}

export interface PlatformSetting {
  key: string;
  value: unknown;
  updatedAt: string;
  updatedByUserId: string | null;
}

export interface AdminRow {
  id: string;
  userId: string;
  email: string;
  role: PlatformRole;
  status: 'ACTIVE' | 'DISABLED';
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  version: number;
}

export interface SupportRecord {
  id: string;
  recordNo: number;
  serviceCode: string;
  workflowType: string;
  customer: { id: string; name: string } | null;
  walkInName: string | null;
  txnDate: string;
  principalPaise: number;
  customerFeePaise: number;
  expectedCommissionPaise: number;
  amountCollectedPaise: number;
  amountDuePaise: number;
  paymentMethod: string;
  externalRef: string | null;
  notes: string | null;
  details: Record<string, unknown>;
  source: string;
  isManual: boolean;
  opStatus: string;
  paymentStatus: string;
  postingStatus: string;
  connectorStatus: string;
  createdAt?: string;
  [k: string]: unknown;
}

export interface SupportRecordDetail extends SupportRecord {
  events: {
    id: string;
    dimension: string;
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    actorType: string;
    createdAt: string;
  }[];
  allocations: {
    id: string;
    amountPaise: number;
    receiptNo: number | string;
    method: string;
    receivedOn: string | null;
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
  followUps: { id: string; title: string; dueDate: string | null; status: string }[];
  journal: {
    id: string;
    entryNo: number;
    type: string;
    businessDate: string | null;
    description: string;
    lines: {
      account: string;
      accountName: string;
      debitPaise: number;
      creditPaise: number;
      memo: string | null;
    }[];
  }[];
}
