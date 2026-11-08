-- Shops record the complete bank account number for DMT transfers and saved beneficiaries
-- (previously only the last 4 digits). Existing 4-digit values are kept as they are.

ALTER TABLE "beneficiaries" DROP CONSTRAINT "beneficiaries_accountLast4_check";
ALTER TABLE "beneficiaries" RENAME COLUMN "accountLast4" TO "accountNumber";
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_accountNumber_check"
  CHECK ("accountNumber" ~ '^[0-9]{4,18}$');
ALTER INDEX "beneficiaries_tenantId_customerId_bankName_accountLast4_name_ke"
  RENAME TO "beneficiaries_customer_bank_account_name_key";

-- Record details: move the accountLast4 key to accountNumber.
UPDATE "service_records"
SET "details" = ("details" - 'accountLast4') || jsonb_build_object('accountNumber', "details" -> 'accountLast4')
WHERE "details" ? 'accountLast4';
