
-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "totpSecretEnc" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "totpLastStep" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "activeTenantId" UUID,
    "mfaVerifiedAt" TIMESTAMP(3),
    "deviceName" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idleExpiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpires" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_drafts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "step" TEXT NOT NULL DEFAULT 'SHOP',
    "shop" JSONB,
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completedTenantId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ownerDisplayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "statusReason" TEXT,
    "contactPhone" TEXT,
    "contactPhoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "state" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "address" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "logoAttachmentId" UUID,
    "brandColor" TEXT,
    "receiptFooter" TEXT,
    "provisioningKey" TEXT NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "displayName" TEXT,
    "grants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "revokes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "invitedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_counters" (
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "tenant_counters_pkey" PRIMARY KEY ("tenantId","name")
);

-- CreateTable
CREATE TABLE "service_definitions" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "workflowType" TEXT NOT NULL,
    "platformEnabled" BOOLEAN NOT NULL DEFAULT true,
    "providerCapable" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_definitions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "tenant_services" (
    "tenantId" UUID NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),
    "disabledReason" TEXT,

    CONSTRAINT "tenant_services_pkey" PRIMARY KEY ("tenantId","serviceCode")
);

-- CreateTable
CREATE TABLE "custom_service_definitions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "workflowType" TEXT NOT NULL,
    "principalDirection" TEXT NOT NULL DEFAULT 'NONE',
    "defaultFeePaise" BIGINT NOT NULL DEFAULT 0,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "custom_service_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameLower" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "followUpPreference" TEXT NOT NULL DEFAULT 'NONE',
    "archivedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_records" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "recordNo" INTEGER NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "customServiceId" UUID,
    "workflowType" TEXT NOT NULL,
    "principalDirection" TEXT NOT NULL,
    "customerId" UUID,
    "walkInName" TEXT,
    "txnDate" DATE NOT NULL,
    "principalPaise" BIGINT NOT NULL DEFAULT 0,
    "customerFeePaise" BIGINT NOT NULL DEFAULT 0,
    "expectedCommissionPaise" BIGINT NOT NULL DEFAULT 0,
    "receivedCommissionPaise" BIGINT NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
    "principalMethod" TEXT NOT NULL DEFAULT 'CASH',
    "amountCollectedPaise" BIGINT NOT NULL DEFAULT 0,
    "amountAllocatedPaise" BIGINT NOT NULL DEFAULT 0,
    "amountDuePaise" BIGINT NOT NULL DEFAULT 0,
    "externalRef" TEXT,
    "assignedToUserId" UUID,
    "notes" TEXT,
    "followUpDate" DATE,
    "details" JSONB NOT NULL DEFAULT '{}',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "opStatus" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    "postingStatus" TEXT NOT NULL DEFAULT 'UNPOSTED',
    "postingSeq" INTEGER NOT NULL DEFAULT 0,
    "connectorStatus" TEXT NOT NULL DEFAULT 'NONE',
    "clientRef" TEXT,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "service_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_status_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "dimension" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "reason" TEXT,
    "data" JSONB,
    "actorUserId" UUID,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "uploadedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_tasks" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "recordId" UUID,
    "customerId" UUID,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedToUserId" UUID,
    "completedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "follow_up_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "receiptNo" INTEGER NOT NULL,
    "customerId" UUID,
    "method" TEXT NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "receivedOn" DATE NOT NULL,
    "notes" TEXT,
    "journalEntryId" UUID NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "reversalEntryId" UUID,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "collectionId" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "method" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "vendor" TEXT,
    "notes" TEXT,
    "journalEntryId" UUID NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "reversalJournalEntryId" UUID,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_receipts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "receivedOn" DATE NOT NULL,
    "allocations" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "journalEntryId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "entryNo" INTEGER NOT NULL,
    "businessDate" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "postingKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reversesEntryId" UUID,
    "reversedByEntryId" UUID,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "debitPaise" BIGINT NOT NULL DEFAULT 0,
    "creditPaise" BIGINT NOT NULL DEFAULT 0,
    "memo" TEXT,
    "businessDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_closings" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "openingCashPaise" BIGINT NOT NULL,
    "cashInPaise" BIGINT NOT NULL,
    "cashOutPaise" BIGINT NOT NULL,
    "expectedCashPaise" BIGINT NOT NULL,
    "countedCashPaise" BIGINT NOT NULL,
    "variancePaise" BIGINT NOT NULL,
    "varianceEntryId" UUID,
    "notes" TEXT,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "closedByUserId" UUID NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "reopenRequestedBy" UUID,
    "reopenRequestedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "reopenApprovedBy" UUID,
    "reopenedAt" TIMESTAMP(3),
    "closeCount" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_closings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "currentVersionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_versions" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPricePaise" BIGINT NOT NULL,
    "annualPricePaise" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "taxRateBps" INTEGER NOT NULL DEFAULT 1800,
    "taxInclusive" BOOLEAN NOT NULL DEFAULT false,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "graceDays" INTEGER NOT NULL DEFAULT 7,
    "entitlements" JSONB NOT NULL,
    "existingSubscribers" TEXT NOT NULL DEFAULT 'KEEP_CURRENT_VERSION',
    "isDemoDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "planVersionId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "scheduledPlanVersionId" UUID,
    "scheduledBillingCycle" TEXT,
    "scheduledChangeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "fromPlanVersionId" UUID,
    "toPlanVersionId" UUID,
    "data" JSONB,
    "actorUserId" UUID,
    "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlement_overrides" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlement_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "tenantId" UUID NOT NULL,
    "metric" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("tenantId","metric","periodKey")
);

-- CreateTable
CREATE TABLE "usage_adjustments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "metric" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_submissions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "planVersionId" UUID NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "payerReference" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "expectedPaise" BIGINT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedByUserId" UUID NOT NULL,
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_configs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'DISABLED',
    "credentialsEnc" TEXT,
    "credentialsMasked" JSONB,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "enabledServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastHealthAt" TIMESTAMP(3),
    "lastHealthStatus" TEXT,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "connector_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_operations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerRef" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "provider_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_operation_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_operation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_receipts" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "tenantId" UUID,
    "signatureValid" BOOLEAN NOT NULL,
    "rawBodySha256" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_runs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stats" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_exceptions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "operationId" UUID,
    "kind" TEXT NOT NULL,
    "details" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "actorUserId" UUID,
    "actorType" TEXT NOT NULL,
    "supportSessionId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "requestId" TEXT,
    "ipHash" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "storageKey" TEXT,
    "rowCount" INTEGER,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_access_sessions" (
    "id" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'READ_ONLY',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedBy" UUID,

    CONSTRAINT "support_access_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedByUserId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL,
    "toHash" TEXT NOT NULL,
    "toMasked" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_userId_key" ON "platform_admins"("userId");

-- CreateIndex
CREATE INDEX "otp_challenges_email_purpose_createdAt_idx" ON "otp_challenges"("email", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "otp_challenges_ipHash_createdAt_idx" ON "otp_challenges"("ipHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_sessionId_idx" ON "refresh_tokens"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_drafts_userId_key" ON "onboarding_drafts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_provisioningKey_key" ON "tenants"("provisioningKey");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenantId_id_key" ON "branches"("tenantId", "id");

-- CreateIndex
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenantId_userId_key" ON "memberships"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_service_definitions_tenantId_id_key" ON "custom_service_definitions"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_service_definitions_tenantId_name_key" ON "custom_service_definitions"("tenantId", "name");

-- CreateIndex
CREATE INDEX "customers_tenantId_nameLower_idx" ON "customers"("tenantId", "nameLower");

-- CreateIndex
CREATE INDEX "customers_tenantId_phone_idx" ON "customers"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenantId_id_key" ON "customers"("tenantId", "id");

-- CreateIndex
CREATE INDEX "service_records_tenantId_serviceCode_txnDate_idx" ON "service_records"("tenantId", "serviceCode", "txnDate");

-- CreateIndex
CREATE INDEX "service_records_tenantId_txnDate_idx" ON "service_records"("tenantId", "txnDate");

-- CreateIndex
CREATE INDEX "service_records_tenantId_customerId_idx" ON "service_records"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "service_records_tenantId_opStatus_idx" ON "service_records"("tenantId", "opStatus");

-- CreateIndex
CREATE INDEX "service_records_tenantId_amountDuePaise_idx" ON "service_records"("tenantId", "amountDuePaise");

-- CreateIndex
CREATE INDEX "service_records_tenantId_createdByUserId_idx" ON "service_records"("tenantId", "createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "service_records_tenantId_id_key" ON "service_records"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "service_records_tenantId_recordNo_key" ON "service_records"("tenantId", "recordNo");

-- CreateIndex
CREATE UNIQUE INDEX "service_records_tenantId_clientRef_key" ON "service_records"("tenantId", "clientRef");

-- CreateIndex
CREATE INDEX "record_status_events_tenantId_recordId_createdAt_idx" ON "record_status_events"("tenantId", "recordId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storageKey_key" ON "attachments"("storageKey");

-- CreateIndex
CREATE INDEX "attachments_tenantId_ownerType_ownerId_idx" ON "attachments"("tenantId", "ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_tenantId_id_key" ON "attachments"("tenantId", "id");

-- CreateIndex
CREATE INDEX "follow_up_tasks_tenantId_status_dueDate_idx" ON "follow_up_tasks"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "collections_tenantId_id_key" ON "collections"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "collections_tenantId_receiptNo_key" ON "collections"("tenantId", "receiptNo");

-- CreateIndex
CREATE INDEX "payment_allocations_tenantId_recordId_idx" ON "payment_allocations"("tenantId", "recordId");

-- CreateIndex
CREATE INDEX "expenses_tenantId_paidOn_idx" ON "expenses"("tenantId", "paidOn");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_tenantId_id_key" ON "expenses"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_receipts_tenantId_id_key" ON "commission_receipts"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_tenantId_id_key" ON "ledger_accounts"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_tenantId_code_key" ON "ledger_accounts"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_tenantId_key_key" ON "ledger_accounts"("tenantId", "key");

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_businessDate_idx" ON "journal_entries"("tenantId", "businessDate");

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_sourceType_sourceId_idx" ON "journal_entries"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_id_key" ON "journal_entries"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_entryNo_key" ON "journal_entries"("tenantId", "entryNo");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_postingKey_key" ON "journal_entries"("tenantId", "postingKey");

-- CreateIndex
CREATE INDEX "journal_lines_tenantId_accountId_businessDate_idx" ON "journal_lines"("tenantId", "accountId", "businessDate");

-- CreateIndex
CREATE INDEX "journal_lines_tenantId_entryId_idx" ON "journal_lines"("tenantId", "entryId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_closings_tenantId_businessDate_key" ON "daily_closings"("tenantId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "plan_versions_planId_version_key" ON "plan_versions"("planId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenantId_key" ON "subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "subscription_events_tenantId_createdAt_idx" ON "subscription_events"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "entitlement_overrides_tenantId_key_idx" ON "entitlement_overrides"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "usage_adjustments_tenantId_idempotencyKey_key" ON "usage_adjustments"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "payment_submissions_status_createdAt_idx" ON "payment_submissions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "payment_submissions_tenantId_createdAt_idx" ON "payment_submissions"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "connector_configs_tenantId_provider_key" ON "connector_configs"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "provider_operations_status_updatedAt_idx" ON "provider_operations"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "provider_operations_tenantId_id_key" ON "provider_operations"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_operations_tenantId_idempotencyKey_key" ON "provider_operations"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "provider_operations_provider_providerRef_key" ON "provider_operations"("provider", "providerRef");

-- CreateIndex
CREATE INDEX "provider_operation_events_tenantId_operationId_idx" ON "provider_operation_events"("tenantId", "operationId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_receipts_provider_deliveryId_key" ON "webhook_receipts"("provider", "deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_runs_tenantId_id_key" ON "reconciliation_runs"("tenantId", "id");

-- CreateIndex
CREATE INDEX "reconciliation_exceptions_tenantId_resolvedAt_idx" ON "reconciliation_exceptions"("tenantId", "resolvedAt");

-- CreateIndex
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_scope_key_key" ON "idempotency_records"("scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_dedupeKey_key" ON "outbox_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "outbox_events_status_availableAt_idx" ON "outbox_events"("status", "availableAt");

-- CreateIndex
CREATE INDEX "notifications_tenantId_userId_createdAt_idx" ON "notifications"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_tenantId_createdAt_idx" ON "audit_events"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_actorUserId_createdAt_idx" ON "audit_events"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_action_createdAt_idx" ON "audit_events"("action", "createdAt");

-- CreateIndex
CREATE INDEX "export_jobs_tenantId_createdAt_idx" ON "export_jobs"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "export_jobs_tenantId_id_key" ON "export_jobs"("tenantId", "id");

-- CreateIndex
CREATE INDEX "support_access_sessions_tenantId_startedAt_idx" ON "support_access_sessions"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "email_logs_status_createdAt_idx" ON "email_logs"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_drafts" ADD CONSTRAINT "onboarding_drafts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_services" ADD CONSTRAINT "tenant_services_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "customers"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_tenantId_customServiceId_fkey" FOREIGN KEY ("tenantId", "customServiceId") REFERENCES "custom_service_definitions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_status_events" ADD CONSTRAINT "record_status_events_tenantId_recordId_fkey" FOREIGN KEY ("tenantId", "recordId") REFERENCES "service_records"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "customers"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenantId_collectionId_fkey" FOREIGN KEY ("tenantId", "collectionId") REFERENCES "collections"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenantId_recordId_fkey" FOREIGN KEY ("tenantId", "recordId") REFERENCES "service_records"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_tenantId_entryId_fkey" FOREIGN KEY ("tenantId", "entryId") REFERENCES "journal_entries"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_tenantId_accountId_fkey" FOREIGN KEY ("tenantId", "accountId") REFERENCES "ledger_accounts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_operation_events" ADD CONSTRAINT "provider_operation_events_tenantId_operationId_fkey" FOREIGN KEY ("tenantId", "operationId") REFERENCES "provider_operations"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_exceptions" ADD CONSTRAINT "reconciliation_exceptions_tenantId_runId_fkey" FOREIGN KEY ("tenantId", "runId") REFERENCES "reconciliation_runs"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

