import '../../core/registry/services.dart';
import 'json.dart';

class CustomerRef {
  const CustomerRef({required this.id, required this.name});
  final String id;
  final String name;

  factory CustomerRef.fromJson(Json j) => CustomerRef(id: str(j, 'id'), name: str(j, 'name'));
}

class RecordEvent {
  const RecordEvent({required this.id, required this.dimension, this.fromStatus, this.toStatus, this.reason, this.actorType, required this.createdAt});
  final String id;

  /// OPERATIONAL | POSTING | EDIT | CONNECTOR …
  final String dimension;
  final String? fromStatus;
  final String? toStatus;
  final String? reason;
  final String? actorType;
  final String createdAt;

  factory RecordEvent.fromJson(Json j) => RecordEvent(
        id: str(j, 'id'),
        dimension: str(j, 'dimension'),
        fromStatus: strOrNull(j, 'fromStatus'),
        toStatus: strOrNull(j, 'toStatus'),
        reason: strOrNull(j, 'reason'),
        actorType: strOrNull(j, 'actorType'),
        createdAt: str(j, 'createdAt'),
      );
}

class RecordAllocation {
  const RecordAllocation({required this.id, required this.amountPaise, required this.receiptNo, required this.method, required this.receivedOn, required this.reversed});
  final String id;
  final int amountPaise;
  final String receiptNo;
  final String method;
  final String receivedOn;
  final bool reversed;

  factory RecordAllocation.fromJson(Json j) => RecordAllocation(
        id: str(j, 'id'),
        amountPaise: intOf(j, 'amountPaise'),
        receiptNo: str(j, 'receiptNo'),
        method: str(j, 'method'),
        receivedOn: str(j, 'receivedOn'),
        reversed: boolOf(j, 'reversed'),
      );
}

/// A server-confirmed service record (`GET /v1/records/:id`, list items, create response).
class ServiceRecord {
  const ServiceRecord({
    required this.id,
    required this.recordNo,
    required this.serviceCode,
    this.customServiceId,
    required this.workflowType,
    required this.principalDirection,
    this.customer,
    this.walkInName,
    required this.txnDate,
    required this.principalPaise,
    required this.customerFeePaise,
    required this.expectedCommissionPaise,
    required this.receivedCommissionPaise,
    required this.paymentMethod,
    this.paymentAccountId,
    required this.principalMethod,
    required this.amountCollectedPaise,
    required this.amountAllocatedPaise,
    required this.amountDuePaise,
    required this.receivablePaise,
    this.externalRef,
    this.notes,
    this.followUpDate,
    required this.details,
    required this.source,
    required this.isManual,
    required this.opStatus,
    required this.paymentStatus,
    required this.postingStatus,
    required this.connectorStatus,
    this.clientRef,
    required this.createdAt,
    required this.version,
    this.duplicate = false,
    this.allowedTransitions = const [],
    this.events = const [],
    this.allocations = const [],
  });

  final String id;
  final int recordNo;
  final String serviceCode;
  final String? customServiceId;
  final WorkflowType workflowType;
  final PrincipalDirection principalDirection;
  final CustomerRef? customer;
  final String? walkInName;
  final String txnDate;
  final int principalPaise;
  final int customerFeePaise;
  final int expectedCommissionPaise;
  final int receivedCommissionPaise;
  final String paymentMethod;

  /// The shop's UPI / bank account the customer paid into, when recorded.
  final String? paymentAccountId;
  final String principalMethod;
  final int amountCollectedPaise;
  final int amountAllocatedPaise;
  final int amountDuePaise;
  final int receivablePaise;
  final String? externalRef;
  final String? notes;
  final String? followUpDate;

  /// Detail values as returned (sensitive values may be masked, e.g. "******3210").
  final Map<String, Object?> details;
  final String source;
  final bool isManual;
  final String opStatus;
  final String paymentStatus;
  final String postingStatus;
  final String connectorStatus;
  final String? clientRef;
  final String createdAt;
  final int version;

  /// True when the server recognised the clientRef and returned the original record.
  final bool duplicate;
  final List<String> allowedTransitions;
  final List<RecordEvent> events;
  final List<RecordAllocation> allocations;

  String get customerLabel => customer?.name ?? walkInName ?? '';

  factory ServiceRecord.fromJson(Json j) => ServiceRecord(
        id: str(j, 'id'),
        recordNo: intOf(j, 'recordNo'),
        serviceCode: str(j, 'serviceCode'),
        customServiceId: strOrNull(j, 'customServiceId'),
        workflowType: workflowFromApi(strOrNull(j, 'workflowType')),
        principalDirection: principalDirectionFromApi(strOrNull(j, 'principalDirection')),
        customer: j['customer'] is Map ? CustomerRef.fromJson(asJson(j['customer'])) : null,
        walkInName: strOrNull(j, 'walkInName'),
        txnDate: str(j, 'txnDate'),
        principalPaise: intOf(j, 'principalPaise'),
        customerFeePaise: intOf(j, 'customerFeePaise'),
        expectedCommissionPaise: intOf(j, 'expectedCommissionPaise'),
        receivedCommissionPaise: intOf(j, 'receivedCommissionPaise'),
        paymentMethod: str(j, 'paymentMethod', 'CASH'),
        paymentAccountId: strOrNull(j, 'paymentAccountId'),
        principalMethod: str(j, 'principalMethod', 'CASH'),
        amountCollectedPaise: intOf(j, 'amountCollectedPaise'),
        amountAllocatedPaise: intOf(j, 'amountAllocatedPaise'),
        amountDuePaise: intOf(j, 'amountDuePaise'),
        receivablePaise: intOf(j, 'receivablePaise'),
        externalRef: strOrNull(j, 'externalRef'),
        notes: strOrNull(j, 'notes'),
        followUpDate: strOrNull(j, 'followUpDate'),
        details: asJson(j['details']),
        source: str(j, 'source', 'MANUAL'),
        isManual: boolOf(j, 'isManual', true),
        opStatus: str(j, 'opStatus'),
        paymentStatus: str(j, 'paymentStatus'),
        postingStatus: str(j, 'postingStatus'),
        connectorStatus: str(j, 'connectorStatus', 'NONE'),
        clientRef: strOrNull(j, 'clientRef'),
        createdAt: str(j, 'createdAt'),
        version: intOf(j, 'version'),
        duplicate: boolOf(j, 'duplicate'),
        allowedTransitions: strList(j, 'allowedTransitions'),
        events: asJsonList(j['events']).map(RecordEvent.fromJson).toList(),
        allocations: asJsonList(j['allocations']).map(RecordAllocation.fromJson).toList(),
      );
}

/// Body of `POST /v1/records` (shared `recordCreateSchema`). Amounts are integer paise.
class RecordDraftData {
  const RecordDraftData({
    required this.serviceCode,
    this.customServiceId,
    this.customerId,
    this.customerName,
    this.walkInName,
    required this.txnDate,
    required this.opStatus,
    this.principalPaise = 0,
    this.customerFeePaise = 0,
    this.expectedCommissionPaise = 0,
    this.paymentMethod = 'CASH',
    this.paymentAccountId,
    this.amountCollectedPaise = 0,
    this.principalMethod = 'CASH',
    this.externalRef,
    this.notes,
    this.followUpDate,
    this.details = const {},
    this.post = false,
  });

  final String serviceCode;
  final String? customServiceId;
  final String? customerId;

  /// Display-only (not sent): the chosen customer's name, for draft lists.
  final String? customerName;
  final String? walkInName;
  final String txnDate;
  final String opStatus;
  final int principalPaise;
  final int customerFeePaise;
  final int expectedCommissionPaise;
  final String paymentMethod;
  final String? paymentAccountId;
  final int amountCollectedPaise;
  final String principalMethod;
  final String? externalRef;
  final String? notes;
  final String? followUpDate;
  final Map<String, Object?> details;
  final bool post;

  String get displayName => customerName ?? walkInName ?? '';

  static String? _blank(String? s) => (s == null || s.trim().isEmpty) ? null : s.trim();

  /// API body. `clientRef` is added by the sync queue.
  Json toApiJson({String? clientRef}) => {
        'serviceCode': serviceCode,
        'customServiceId': ?customServiceId,
        'customerId': customerId,
        'walkInName': customerId == null ? _blank(walkInName) : null,
        'txnDate': txnDate,
        'opStatus': opStatus,
        'principalPaise': principalPaise,
        'customerFeePaise': customerFeePaise,
        'expectedCommissionPaise': expectedCommissionPaise,
        'paymentMethod': paymentMethod,
        'paymentAccountId': (paymentMethod == 'UPI' || paymentMethod == 'BANK') && amountCollectedPaise > 0 ? paymentAccountId : null,
        'amountCollectedPaise': amountCollectedPaise,
        'principalMethod': principalMethod,
        'externalRef': _blank(externalRef),
        'notes': _blank(notes),
        'followUpDate': _blank(followUpDate),
        'details': details,
        'post': post,
        'clientRef': ?clientRef,
      };

  /// Local storage form (includes display-only fields).
  Json toStorageJson() => {...toApiJson(), 'customerName': customerName};

  factory RecordDraftData.fromStorageJson(Json j) => RecordDraftData(
        serviceCode: str(j, 'serviceCode'),
        customServiceId: strOrNull(j, 'customServiceId'),
        customerId: strOrNull(j, 'customerId'),
        customerName: strOrNull(j, 'customerName'),
        walkInName: strOrNull(j, 'walkInName'),
        txnDate: str(j, 'txnDate'),
        opStatus: str(j, 'opStatus'),
        principalPaise: intOf(j, 'principalPaise'),
        customerFeePaise: intOf(j, 'customerFeePaise'),
        expectedCommissionPaise: intOf(j, 'expectedCommissionPaise'),
        paymentMethod: str(j, 'paymentMethod', 'CASH'),
        paymentAccountId: strOrNull(j, 'paymentAccountId'),
        amountCollectedPaise: intOf(j, 'amountCollectedPaise'),
        principalMethod: str(j, 'principalMethod', 'CASH'),
        externalRef: strOrNull(j, 'externalRef'),
        notes: strOrNull(j, 'notes'),
        followUpDate: strOrNull(j, 'followUpDate'),
        details: asJson(j['details']),
        post: boolOf(j, 'post'),
      );
}

class PostingPreview {
  const PostingPreview({required this.direction, required this.receivablePaise, required this.amountDuePaise, required this.cashEffectPaise, required this.lines});
  final PrincipalDirection direction;
  final int receivablePaise;
  final int amountDuePaise;
  final int cashEffectPaise;
  final List<PreviewLine> lines;

  factory PostingPreview.fromJson(Json j) => PostingPreview(
        direction: principalDirectionFromApi(strOrNull(j, 'direction')),
        receivablePaise: intOf(j, 'receivablePaise'),
        amountDuePaise: intOf(j, 'amountDuePaise'),
        cashEffectPaise: intOf(j, 'cashEffectPaise'),
        lines: asJsonList(j['lines']).map(PreviewLine.fromJson).toList(),
      );
}

class PreviewLine {
  const PreviewLine({required this.account, required this.debitPaise, required this.creditPaise, this.memo});
  final String account;
  final int debitPaise;
  final int creditPaise;
  final String? memo;

  factory PreviewLine.fromJson(Json j) =>
      PreviewLine(account: str(j, 'account'), debitPaise: intOf(j, 'debitPaise'), creditPaise: intOf(j, 'creditPaise'), memo: strOrNull(j, 'memo'));
}

class RecordFilters {
  const RecordFilters({this.service, this.status, this.paymentStatus, this.from, this.to, this.q});
  final String? service;
  final String? status;
  final String? paymentStatus;
  final String? from;
  final String? to;
  final String? q;

  bool get isEmpty => service == null && status == null && paymentStatus == null && from == null && to == null && (q ?? '').isEmpty;

  int get activeCount => [service, status, paymentStatus, from, to].where((v) => v != null).length;

  Map<String, Object?> toQuery(int page) =>
      {'service': service, 'status': status, 'paymentStatus': paymentStatus, 'from': from, 'to': to, 'q': q, 'page': page, 'pageSize': 25};

  RecordFilters copyWith({String? Function()? service, String? Function()? status, String? Function()? paymentStatus, String? Function()? from, String? Function()? to, String? Function()? q}) =>
      RecordFilters(
        service: service != null ? service() : this.service,
        status: status != null ? status() : this.status,
        paymentStatus: paymentStatus != null ? paymentStatus() : this.paymentStatus,
        from: from != null ? from() : this.from,
        to: to != null ? to() : this.to,
        q: q != null ? q() : this.q,
      );

  @override
  bool operator ==(Object other) =>
      other is RecordFilters &&
      other.service == service &&
      other.status == status &&
      other.paymentStatus == paymentStatus &&
      other.from == from &&
      other.to == to &&
      other.q == q;

  @override
  int get hashCode => Object.hash(service, status, paymentStatus, from, to, q);
}
