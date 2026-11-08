-- Customer KYC: status and masked ID only (last 4 characters). ID photos live in attachments
-- (ownerType CUSTOMER_KYC) behind the customers.view_sensitive permission.
ALTER TABLE "customers"
  ADD COLUMN "kycStatus" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "kycIdType" TEXT,
  ADD COLUMN "kycIdLast4" TEXT,
  ADD COLUMN "kycRemarks" TEXT,
  ADD COLUMN "kycVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "kycVerifiedByUserId" UUID;
ALTER TABLE "customers" ADD CONSTRAINT "customers_kycStatus_check"
  CHECK ("kycStatus" IN ('NONE', 'PENDING', 'VERIFIED', 'REJECTED'));
ALTER TABLE "customers" ADD CONSTRAINT "customers_kycIdLast4_check"
  CHECK ("kycIdLast4" IS NULL OR "kycIdLast4" ~ '^[A-Z0-9]{4}$');

-- Saved DMT beneficiaries per customer.
CREATE TABLE "beneficiaries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "ifsc" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "beneficiaries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "beneficiaries_accountLast4_check" CHECK ("accountLast4" ~ '^[0-9]{4}$')
);
CREATE UNIQUE INDEX "beneficiaries_tenantId_id_key" ON "beneficiaries"("tenantId", "id");
CREATE UNIQUE INDEX "beneficiaries_tenantId_customerId_bankName_accountLast4_name_key"
  ON "beneficiaries"("tenantId", "customerId", "bankName", "accountLast4", "name");
CREATE INDEX "beneficiaries_tenantId_customerId_idx" ON "beneficiaries"("tenantId", "customerId");
-- Composite FK keeps a beneficiary inside its customer's shop.
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_tenantId_customerId_fkey"
  FOREIGN KEY ("tenantId", "customerId") REFERENCES "customers"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "beneficiaries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "beneficiaries" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
