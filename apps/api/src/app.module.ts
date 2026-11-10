import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Db } from './common/db';
import { RedisService } from './common/redis';
import { SecurityGuard } from './common/security.guard';
import { RequestIdMiddleware } from './common/http';
import { IdempotencyService } from './common/idempotency';
import { AuditService } from './common/audit';
import { JobsService } from './jobs/jobs.service';
import { MaintenanceService } from './jobs/maintenance.service';
import { EmailService } from './modules/email/email.service';
import { OtpService } from './modules/auth/otp.service';
import { SessionService } from './modules/auth/session.service';
import { MeService } from './modules/auth/me.service';
import { AuthController } from './modules/auth/auth.controller';
import { OnboardingController } from './modules/onboarding/onboarding.controller';
import { LedgerService } from './modules/ledger/ledger.service';
import { EntitlementsService } from './modules/subscription/entitlements.service';
import { SubscriptionService } from './modules/subscription/subscription.service';
import { SubscriptionController } from './modules/subscription/subscription.controller';
import { ServiceAvailabilityService } from './modules/services/service-availability.service';
import { RecordsService } from './modules/records/records.service';
import { RecordsController } from './modules/records/records.controller';
import { CustomersController, FollowUpsController } from './modules/customers/customers.controller';
import { MoneyService } from './modules/money/money.service';
import { MoneyController } from './modules/money/money.controller';
import { ClosingController } from './modules/closing/closing.controller';
import { ReportsController } from './modules/reports/reports.controller';
import { TenantController } from './modules/tenant/tenant.controller';
import { StaffController } from './modules/staff/staff.controller';
import { NotificationsController } from './modules/notifications/notifications.controller';
import { StorageService } from './modules/storage/storage.service';
import { AttachmentsController } from './modules/attachments/attachments.controller';
import { ExportsController } from './modules/exports/exports.controller';
import { IntegrationsService } from './modules/integrations/integrations.service';
import { Sms21Service } from './modules/messaging/sms21.service';
import { DomainsController } from './modules/domains/domains.controller';
import { DomainsService } from './modules/domains/domains.service';
import { MastersController } from './modules/masters/masters.controller';
import { MastersService } from './modules/masters/masters.service';
import { PaymentAccountsController } from './modules/payment-accounts/payment-accounts.controller';
import { PaymentAccountsService } from './modules/payment-accounts/payment-accounts.service';
import { IntegrationsController } from './modules/integrations/integrations.controller';
import { AdminAuthController } from './modules/admin/admin-auth.controller';
import { AdminController } from './modules/admin/admin.controller';
import { SupportController } from './modules/admin/support.controller';
import { HealthController, MetricsMiddleware } from './modules/health/health.controller';

export const CONTROLLERS = [
  HealthController,
  AuthController,
  OnboardingController,
  TenantController,
  RecordsController,
  CustomersController,
  FollowUpsController,
  MoneyController,
  ClosingController,
  ReportsController,
  StaffController,
  SubscriptionController,
  NotificationsController,
  AttachmentsController,
  ExportsController,
  IntegrationsController,
  AdminAuthController,
  AdminController,
  DomainsController,
  MastersController,
  PaymentAccountsController,
  SupportController,
];

@Module({
  controllers: CONTROLLERS,
  providers: [
    Db,
    RedisService,
    IdempotencyService,
    AuditService,
    JobsService,
    MaintenanceService,
    EmailService,
    OtpService,
    SessionService,
    MeService,
    LedgerService,
    EntitlementsService,
    SubscriptionService,
    ServiceAvailabilityService,
    RecordsService,
    MoneyService,
    StorageService,
    IntegrationsService,
    Sms21Service,
    DomainsService,
    MastersService,
    PaymentAccountsService,
    { provide: APP_GUARD, useClass: SecurityGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, MetricsMiddleware).forRoutes('*');
  }
}
