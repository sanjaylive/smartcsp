-- The shop's own receiving accounts: UPI IDs (with optional QR image) and bank accounts.
CREATE TABLE "payment_accounts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "upiId" TEXT,
    "upiApp" TEXT,
    "payeeName" TEXT,
    "holderName" TEXT,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "ifsc" TEXT,
    "accountType" TEXT,
    "qrAttachmentId" UUID,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_accounts_kind_check" CHECK ("kind" IN ('UPI', 'BANK'))
);

CREATE UNIQUE INDEX "payment_accounts_tenantId_id_key" ON "payment_accounts"("tenantId", "id");
CREATE UNIQUE INDEX "payment_accounts_tenantId_label_key" ON "payment_accounts"("tenantId", "label");
CREATE INDEX "payment_accounts_tenantId_kind_idx" ON "payment_accounts"("tenantId", "kind");
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_accounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payment_accounts" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());

-- Which of those accounts a record's payment went into.
ALTER TABLE "service_records" ADD COLUMN "paymentAccountId" UUID;
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_paymentAccount_fkey" FOREIGN KEY ("tenantId", "paymentAccountId") REFERENCES "payment_accounts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Pay2All callbacks are unsigned: each shop gets an unguessable callback URL instead.
ALTER TABLE "connector_configs" ADD COLUMN "webhookToken" TEXT;
CREATE UNIQUE INDEX "connector_configs_webhookToken_key" ON "connector_configs"("webhookToken");
