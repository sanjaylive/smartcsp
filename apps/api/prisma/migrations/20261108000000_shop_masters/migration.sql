-- Shop-maintained lists: expense categories, payment modes, providers / portals, fee presets.
CREATE TABLE "shop_masters" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "shop_masters_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shop_masters_kind_check" CHECK ("kind" IN ('EXPENSE_CATEGORY', 'PAYMENT_MODE', 'PROVIDER', 'FEE_PRESET'))
);

CREATE UNIQUE INDEX "shop_masters_tenantId_id_key" ON "shop_masters"("tenantId", "id");
CREATE UNIQUE INDEX "shop_masters_tenantId_kind_name_key" ON "shop_masters"("tenantId", "kind", "name");
CREATE INDEX "shop_masters_tenantId_kind_idx" ON "shop_masters"("tenantId", "kind");

ALTER TABLE "shop_masters" ADD CONSTRAINT "shop_masters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security: a shop sees only its own lists.
ALTER TABLE "shop_masters" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "shop_masters" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());

-- Which shop-defined payment mode / provider a transaction used (labels; the ledger keeps using
-- the existing method column so posting rules are unchanged).
ALTER TABLE "service_records" ADD COLUMN "paymentMode" TEXT, ADD COLUMN "provider" TEXT;
ALTER TABLE "collections" ADD COLUMN "paymentMode" TEXT;
ALTER TABLE "expenses" ADD COLUMN "paymentMode" TEXT;
CREATE INDEX "service_records_tenantId_provider_idx" ON "service_records"("tenantId", "provider");
