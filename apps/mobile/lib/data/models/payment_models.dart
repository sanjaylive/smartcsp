import 'json.dart';
import 'record_models.dart';

/// The shop's own receiving account (UPI ID with optional QR image, or a bank account).
class PaymentAccount {
  const PaymentAccount({
    required this.id,
    required this.kind,
    required this.label,
    this.upiId,
    this.upiApp,
    this.payeeName,
    this.holderName,
    this.bankName,
    this.accountNumber,
    this.ifsc,
    this.accountType,
    this.qrAttachmentId,
    required this.isDefault,
    required this.active,
    required this.version,
  });

  final String id;

  /// UPI | BANK
  final String kind;
  final String label;
  final String? upiId;
  final String? upiApp;
  final String? payeeName;
  final String? holderName;
  final String? bankName;
  final String? accountNumber;
  final String? ifsc;
  final String? accountType;
  final String? qrAttachmentId;
  final bool isDefault;
  final bool active;
  final int version;

  bool get isUpi => kind == 'UPI';

  factory PaymentAccount.fromJson(Json j) => PaymentAccount(
        id: str(j, 'id'),
        kind: str(j, 'kind', 'UPI'),
        label: str(j, 'label'),
        upiId: strOrNull(j, 'upiId'),
        upiApp: strOrNull(j, 'upiApp'),
        payeeName: strOrNull(j, 'payeeName'),
        holderName: strOrNull(j, 'holderName'),
        bankName: strOrNull(j, 'bankName'),
        accountNumber: strOrNull(j, 'accountNumber'),
        ifsc: strOrNull(j, 'ifsc'),
        accountType: strOrNull(j, 'accountType'),
        qrAttachmentId: strOrNull(j, 'qrAttachmentId'),
        isDefault: boolOf(j, 'isDefault'),
        active: boolOf(j, 'active', true),
        version: intOf(j, 'version'),
      );
}

/// Pay2All connector settings for this shop (`GET /v1/integrations`).
class ConnectorOverview {
  const ConnectorOverview({
    required this.mode,
    required this.hasCredentials,
    this.maskedToken,
    required this.enabledServices,
    required this.liveServices,
    required this.uatServices,
    required this.pendingServices,
    required this.supportedServices,
    required this.simulatorAvailable,
    this.callbackUrl,
    this.lastHealthStatus,
    required this.planAllows,
  });

  /// DISABLED (all Offline) | UAT | LIVE | SIMULATOR
  final String mode;
  final bool hasCredentials;
  final String? maskedToken;
  final List<String> enabledServices;
  final List<String> liveServices;
  final List<String> uatServices;
  final List<String> pendingServices;
  final List<String> supportedServices;
  final bool simulatorAvailable;
  final String? callbackUrl;
  final String? lastHealthStatus;
  final bool planAllows;

  factory ConnectorOverview.fromJson(Json j) {
    final list = asJsonList(j['providers']);
    final p = list.isEmpty ? <String, Object?>{} : list.first;
    return ConnectorOverview(
      mode: str(p, 'mode', 'DISABLED'),
      hasCredentials: boolOf(p, 'hasCredentials'),
      maskedToken: strOrNull(asJson(p['credentialsMasked']), 'apiToken'),
      enabledServices: strList(p, 'enabledServices'),
      liveServices: strList(p, 'liveServices'),
      uatServices: strList(p, 'uatServices'),
      pendingServices: strList(p, 'pendingServices'),
      supportedServices: strList(p, 'supportedServices'),
      simulatorAvailable: boolOf(p, 'simulatorAvailable'),
      callbackUrl: strOrNull(p, 'callbackUrl'),
      lastHealthStatus: strOrNull(p, 'lastHealthStatus'),
      planAllows: boolOf(j, 'planAllowsConnector'),
    );
  }
}

/// A Live (provider) operation and the record it created.
class ProviderOperation {
  const ProviderOperation({
    required this.id,
    required this.mode,
    required this.status,
    required this.outcomeKnown,
    this.message,
    this.providerRef,
    required this.record,
  });

  final String id;
  final String mode;

  /// INITIATED | PENDING | UNKNOWN | CONFIRMED | FAILED
  final String status;
  final bool outcomeKnown;
  final String? message;
  final String? providerRef;
  final ServiceRecord record;

  factory ProviderOperation.fromJson(Json j) => ProviderOperation(
        id: str(j, 'id'),
        mode: str(j, 'mode'),
        status: str(j, 'status'),
        outcomeKnown: boolOf(j, 'outcomeKnown'),
        message: strOrNull(j, 'message'),
        providerRef: strOrNull(j, 'providerRef'),
        record: ServiceRecord.fromJson(asJson(j['record'])),
      );
}

/// Pay2All operator.
class P2AOperator {
  const P2AOperator(this.id, this.name, this.service);
  final int id;
  final String name;
  final String service;
}

class P2APlan {
  const P2APlan({required this.amountPaise, this.validity, this.data, this.description, this.category});
  final int amountPaise;
  final String? validity;
  final String? data;
  final String? description;
  final String? category;

  factory P2APlan.fromJson(Json j) {
    final amt = double.tryParse(str(j, 'amount')) ?? 0;
    return P2APlan(
      amountPaise: (amt * 100).round(),
      validity: strOrNull(j, 'validity'),
      data: strOrNull(j, 'data'),
      description: strOrNull(j, 'description'),
      category: strOrNull(j, 'category'),
    );
  }
}

class BillerParam {
  const BillerParam({required this.name, this.optional = false, this.numeric = false, this.maxLength});
  final String name;
  final bool optional;
  final bool numeric;
  final int? maxLength;
}

class FetchedBill {
  const FetchedBill({this.amountPaise, this.dueDate, this.customerName, this.billNumber, this.billPeriod, this.referenceId});
  final int? amountPaise;
  final String? dueDate;
  final String? customerName;
  final String? billNumber;
  final String? billPeriod;
  final String? referenceId;

  factory FetchedBill.fromJson(Json j) {
    final amt = double.tryParse(str(j, 'amount'));
    return FetchedBill(
      amountPaise: amt == null ? null : (amt * 100).round(),
      dueDate: strOrNull(j, 'dueDate'),
      customerName: strOrNull(j, 'customerName'),
      billNumber: strOrNull(j, 'billNumber'),
      billPeriod: strOrNull(j, 'billPeriod'),
      referenceId: strOrNull(j, 'referenceId'),
    );
  }
}
