import '../../core/registry/services.dart';
import 'json.dart';

class TenantProfile {
  const TenantProfile({required this.id, required this.name, required this.status, required this.timezone, required this.preferredLanguage, this.statusReason});
  final String id;
  final String name;
  final String status;
  final String? statusReason;
  final String timezone;
  final String preferredLanguage;

  bool get isSuspended => status == 'SUSPENDED';

  factory TenantProfile.fromJson(Json j) => TenantProfile(
        id: str(j, 'id'),
        name: str(j, 'name'),
        status: str(j, 'status', 'ACTIVE'),
        statusReason: strOrNull(j, 'statusReason'),
        timezone: str(j, 'timezone', 'Asia/Kolkata'),
        preferredLanguage: str(j, 'preferredLanguage', 'en'),
      );
}

class ServiceAvailability {
  const ServiceAvailability({
    required this.code,
    required this.selected,
    required this.canCreate,
    required this.hasHistory,
    this.reason,
    required this.workflowType,
  });

  final String code;
  final bool selected;
  final bool canCreate;
  final bool hasHistory;

  /// PLATFORM | TENANT | PLAN | PERMISSION when new records cannot be created.
  final String? reason;
  final WorkflowType workflowType;

  factory ServiceAvailability.fromJson(Json j) => ServiceAvailability(
        code: str(j, 'code'),
        selected: boolOf(j, 'selected'),
        canCreate: boolOf(j, 'canCreate'),
        hasHistory: boolOf(j, 'hasHistory'),
        reason: strOrNull(j, 'reason'),
        workflowType: workflowFromApi(strOrNull(j, 'workflowType')),
      );
}

class CustomService {
  const CustomService({
    required this.id,
    required this.name,
    required this.category,
    required this.workflowType,
    required this.principalDirection,
    required this.defaultFeePaise,
    required this.fields,
    required this.active,
  });

  final String id;
  final String name;
  final String category;
  final WorkflowType workflowType;
  final PrincipalDirection principalDirection;
  final int defaultFeePaise;
  final List<FieldDef> fields;
  final bool active;

  factory CustomService.fromJson(Json j) => CustomService(
        id: str(j, 'id'),
        name: str(j, 'name'),
        category: str(j, 'category'),
        workflowType: workflowFromApi(strOrNull(j, 'workflowType')),
        principalDirection: principalDirectionFromApi(strOrNull(j, 'principalDirection')),
        defaultFeePaise: intOf(j, 'defaultFeePaise'),
        fields: customFieldsToFieldDefs(j['fields'] is List ? j['fields'] as List : const []),
        active: boolOf(j, 'active', true),
      );
}

class SupportAccess {
  const SupportAccess({required this.id, required this.reason, required this.expiresAt});
  final String id;
  final String reason;
  final String expiresAt;

  factory SupportAccess.fromJson(Json j) => SupportAccess(id: str(j, 'id'), reason: str(j, 'reason'), expiresAt: str(j, 'expiresAt'));
}

class Announcement {
  const Announcement({required this.id, required this.title, required this.body, required this.severity});
  final String id;
  final String title;
  final String body;
  final String severity;

  factory Announcement.fromJson(Json j) =>
      Announcement(id: str(j, 'id'), title: str(j, 'title'), body: str(j, 'body'), severity: str(j, 'severity', 'INFO'));
}

/// `GET /v1/tenant/context` — everything needed to render the shop for this user.
class TenantContext {
  const TenantContext({
    required this.tenant,
    required this.role,
    required this.permissions,
    required this.services,
    required this.customServices,
    required this.quickActions,
    required this.dashboardWidgets,
    required this.planName,
    required this.planStatus,
    this.monthlyRecordLimit,
    required this.recordsThisPeriod,
    required this.supportAccess,
    required this.announcements,
    required this.unreadNotifications,
  });

  final TenantProfile tenant;
  final String role;
  final Set<String> permissions;
  final List<ServiceAvailability> services;
  final List<CustomService> customServices;

  /// Service codes the user can create records for, in server order.
  final List<String> quickActions;
  final List<String> dashboardWidgets;
  final String planName;
  final String planStatus;
  final int? monthlyRecordLimit;
  final int recordsThisPeriod;
  final List<SupportAccess> supportAccess;
  final List<Announcement> announcements;
  final int unreadNotifications;

  bool can(String permission) => permissions.contains(permission);

  ServiceAvailability? service(String code) {
    for (final s in services) {
      if (s.code == code) return s;
    }
    return null;
  }

  List<CustomService> get activeCustomServices => customServices.where((c) => c.active).toList();

  /// Services that appear in record filters: selected or with historical records.
  List<String> get visibleServiceCodes => services.where((s) => s.selected || s.hasHistory).map((s) => s.code).toList();

  factory TenantContext.fromJson(Json j) {
    final membership = asJson(j['membership']);
    final plan = asJson(j['plan']);
    final ent = asJson(plan['entitlements']);
    final usage = asJson(j['usage']);
    return TenantContext(
      tenant: TenantProfile.fromJson(asJson(j['tenant'])),
      role: str(membership, 'role'),
      permissions: strList(membership, 'permissions').toSet(),
      services: asJsonList(j['services']).map(ServiceAvailability.fromJson).toList(),
      customServices: asJsonList(j['customServices']).map(CustomService.fromJson).toList(),
      quickActions: asJsonList(j['quickActions']).map((q) => str(q, 'code')).where((c) => c.isNotEmpty).toList(),
      dashboardWidgets: strList(j, 'dashboardWidgets'),
      planName: str(plan, 'name'),
      planStatus: str(plan, 'status'),
      monthlyRecordLimit: intOrNull(ent, 'monthlyRecordLimit'),
      recordsThisPeriod: intOf(usage, 'recordsThisPeriod'),
      supportAccess: asJsonList(j['supportAccessActive']).map(SupportAccess.fromJson).toList(),
      announcements: asJsonList(j['announcements']).map(Announcement.fromJson).toList(),
      unreadNotifications: intOf(j, 'unreadNotifications'),
    );
  }
}

class Metric {
  const Metric({required this.value, this.meaning, this.from, this.to, this.asOf});
  final int value;
  final String? meaning;
  final String? from;
  final String? to;
  final String? asOf;

  factory Metric.fromJson(Json j) {
    final range = asJson(j['range']);
    return Metric(
      value: intOf(j, 'value'),
      meaning: strOrNull(j, 'meaning'),
      from: strOrNull(range, 'from'),
      to: strOrNull(range, 'to'),
      asOf: strOrNull(j, 'asOf'),
    );
  }
}

class VolumeItem {
  const VolumeItem({required this.serviceCode, required this.count, required this.principalPaise, required this.customerFeePaise});
  final String serviceCode;
  final int count;
  final int principalPaise;
  final int customerFeePaise;

  factory VolumeItem.fromJson(Json j) => VolumeItem(
        serviceCode: str(j, 'serviceCode'),
        count: intOf(j, 'count'),
        principalPaise: intOf(j, 'principalPaise'),
        customerFeePaise: intOf(j, 'customerFeePaise'),
      );
}

class FinancialMetrics {
  const FinancialMetrics({
    required this.customerFees,
    required this.cashIn,
    required this.cashOut,
    required this.cashInHand,
    required this.outstandingDues,
    required this.pendingCommission,
  });

  final Metric customerFees;
  final Metric cashIn;
  final Metric cashOut;
  final Metric cashInHand;
  final Metric outstandingDues;
  final Metric pendingCommission;

  factory FinancialMetrics.fromJson(Json j) => FinancialMetrics(
        customerFees: Metric.fromJson(asJson(j['customerFeesPaise'])),
        cashIn: Metric.fromJson(asJson(j['cashInPaise'])),
        cashOut: Metric.fromJson(asJson(j['cashOutPaise'])),
        cashInHand: Metric.fromJson(asJson(j['cashInHandPaise'])),
        outstandingDues: Metric.fromJson(asJson(j['outstandingDuesPaise'])),
        pendingCommission: Metric.fromJson(asJson(j['pendingCommissionPaise'])),
      );
}

class RecentRecord {
  const RecentRecord({
    required this.id,
    required this.recordNo,
    required this.serviceCode,
    this.customerName,
    required this.txnDate,
    required this.opStatus,
    required this.principalPaise,
    required this.customerFeePaise,
  });

  final String id;
  final int recordNo;
  final String serviceCode;
  final String? customerName;
  final String txnDate;
  final String opStatus;
  final int principalPaise;
  final int customerFeePaise;

  factory RecentRecord.fromJson(Json j) => RecentRecord(
        id: str(j, 'id'),
        recordNo: intOf(j, 'recordNo'),
        serviceCode: str(j, 'serviceCode'),
        customerName: strOrNull(j, 'customerName'),
        txnDate: str(j, 'txnDate'),
        opStatus: str(j, 'opStatus'),
        principalPaise: intOf(j, 'principalPaise'),
        customerFeePaise: intOf(j, 'customerFeePaise'),
      );
}

class DueFollowUp {
  const DueFollowUp({required this.id, required this.title, required this.dueDate, this.customerName, this.recordId, required this.version});
  final String id;
  final String title;
  final String dueDate;
  final String? customerName;
  final String? recordId;
  final int version;

  factory DueFollowUp.fromJson(Json j) => DueFollowUp(
        id: str(j, 'id'),
        title: str(j, 'title'),
        dueDate: str(j, 'dueDate'),
        customerName: strOrNull(j, 'customerName'),
        recordId: strOrNull(j, 'recordId'),
        version: intOf(j, 'version'),
      );
}

class Checklist {
  const Checklist({required this.firstCustomer, required this.firstRecord, required this.openingCash, this.staffInvited});
  final bool firstCustomer;
  final bool firstRecord;
  final bool openingCash;

  /// null when the user cannot manage staff.
  final bool? staffInvited;

  bool get complete => firstCustomer && firstRecord && openingCash && (staffInvited ?? true);

  factory Checklist.fromJson(Json j) => Checklist(
        firstCustomer: boolOf(j, 'firstCustomer'),
        firstRecord: boolOf(j, 'firstRecord'),
        openingCash: boolOf(j, 'openingCash'),
        staffInvited: j['staffInvited'] is bool ? j['staffInvited'] as bool : null,
      );
}

/// `GET /v1/dashboard` — today's figures in the shop timezone.
class Dashboard {
  const Dashboard({
    required this.date,
    required this.timezone,
    required this.scope,
    required this.todayRecords,
    required this.volumeMeaning,
    required this.volume,
    required this.pendingApplications,
    this.financial,
    required this.recent,
    required this.followUpsDue,
    required this.checklist,
  });

  final String date;
  final String timezone;

  /// SHOP or MY_RECORDS.
  final String scope;
  final Metric todayRecords;
  final String? volumeMeaning;
  final List<VolumeItem> volume;
  final Metric pendingApplications;
  final FinancialMetrics? financial;
  final List<RecentRecord> recent;
  final List<DueFollowUp> followUpsDue;
  final Checklist checklist;

  factory Dashboard.fromJson(Json j) {
    final sv = asJson(j['serviceVolume']);
    return Dashboard(
      date: str(j, 'date'),
      timezone: str(j, 'timezone', 'Asia/Kolkata'),
      scope: str(j, 'scope', 'SHOP'),
      todayRecords: Metric.fromJson(asJson(j['todayRecords'])),
      volumeMeaning: strOrNull(sv, 'meaning'),
      volume: asJsonList(sv['items']).map(VolumeItem.fromJson).toList(),
      pendingApplications: Metric.fromJson(asJson(j['pendingApplications'])),
      financial: j['financial'] is Map ? FinancialMetrics.fromJson(asJson(j['financial'])) : null,
      recent: asJsonList(j['recentActivity']).map(RecentRecord.fromJson).toList(),
      followUpsDue: asJsonList(j['followUpsDue']).map(DueFollowUp.fromJson).toList(),
      checklist: Checklist.fromJson(asJson(j['checklist'])),
    );
  }
}

class AppNotification {
  const AppNotification({required this.id, required this.type, required this.title, required this.body, this.link, this.readAt, required this.createdAt});
  final String id;
  final String type;
  final String title;
  final String body;
  final String? link;
  final String? readAt;
  final String createdAt;

  bool get isRead => readAt != null;

  factory AppNotification.fromJson(Json j) => AppNotification(
        id: str(j, 'id'),
        type: str(j, 'type'),
        title: str(j, 'title'),
        body: str(j, 'body'),
        link: strOrNull(j, 'link'),
        readAt: strOrNull(j, 'readAt'),
        createdAt: str(j, 'createdAt'),
      );
}
