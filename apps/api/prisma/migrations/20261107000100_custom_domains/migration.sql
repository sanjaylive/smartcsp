-- CreateTable: per-shop custom domains
CREATE TABLE "custom_domains" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "verificationToken" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "custom_domains_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "custom_domains_domain_key" ON "custom_domains"("domain");
CREATE INDEX "custom_domains_tenantId_idx" ON "custom_domains"("tenantId");

ALTER TABLE "custom_domains" ADD CONSTRAINT "custom_domains_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security: a shop sees only its own domains (system bypass for public lookups).
ALTER TABLE "custom_domains" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "custom_domains" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
