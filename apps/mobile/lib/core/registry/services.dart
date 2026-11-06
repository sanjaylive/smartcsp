// Dart port of packages/shared/src/services.ts. Keep the field definitions in sync: the API
// re-validates every record with the same definitions, so a drift only costs a server-side
// validation error, never bad data.
import 'package:flutter/material.dart';

enum FieldType { text, number, date, select, phone, last4, ifsc, checklist, boolean }

enum WorkflowType { transaction, application }

enum PrincipalDirection { payout, collect, none }

PrincipalDirection principalDirectionFromApi(String? v) => switch (v) {
      'PAYOUT' => PrincipalDirection.payout,
      'COLLECT' => PrincipalDirection.collect,
      _ => PrincipalDirection.none,
    };

WorkflowType workflowFromApi(String? v) => v == 'APPLICATION' ? WorkflowType.application : WorkflowType.transaction;

String workflowToApi(WorkflowType w) => w == WorkflowType.application ? 'APPLICATION' : 'TRANSACTION';

@immutable
class FieldOption {
  const FieldOption(this.value, this.labelKey);
  final String value;

  /// Translation key, or literal text for custom services.
  final String labelKey;
}

@immutable
class FieldDef {
  const FieldDef({
    required this.key,
    required this.type,
    required this.labelKey,
    this.required = false,
    this.options = const [],
    this.maxLength,
    this.sensitive = false,
    this.guardSensitive = false,
    this.helpKey,
    this.literalLabel = false,
  });

  final String key;
  final FieldType type;
  final String labelKey;
  final bool required;
  final List<FieldOption> options;
  final int? maxLength;

  /// Masked in API responses unless the viewer has `customers.view_sensitive`.
  final bool sensitive;

  /// Reject text that looks like an Aadhaar or card number.
  final bool guardSensitive;
  final String? helpKey;

  /// Custom-service labels are literal text, not translation keys.
  final bool literalLabel;
}

@immutable
class ServiceDefinition {
  const ServiceDefinition({
    required this.code,
    required this.category,
    required this.workflowType,
    required this.icon,
    required this.accent,
    required this.principalLabelKey,
    required this.fields,
    required this.direction,
    required this.dashboardWidgets,
    required this.providerCapable,
    this.noticeKey,
  });

  final String code;
  final String category;
  final WorkflowType workflowType;

  /// Lucide icon name used on the web; mapped to a Material icon by [serviceIcon].
  final String icon;
  final String accent;
  final String? principalLabelKey;
  final List<FieldDef> fields;
  final PrincipalDirection Function(Map<String, Object?> details) direction;
  final List<String> dashboardWidgets;
  final bool providerCapable;
  final String? noticeKey;

  String get labelKey => 'service.$code.name';
  String get descriptionKey => 'service.$code.description';
}

List<FieldOption> _opt(List<String> values, String prefix) => [for (final v in values) FieldOption(v, '$prefix.$v')];

const aepsOperations = ['CASH_WITHDRAWAL', 'BALANCE_ENQUIRY', 'MINI_STATEMENT', 'CASH_DEPOSIT'];
const microAtmOperations = ['CASH_WITHDRAWAL', 'BALANCE_ENQUIRY'];

PrincipalDirection _opDirection(Map<String, Object?> d) => switch (d['operationType']) {
      'CASH_WITHDRAWAL' => PrincipalDirection.payout,
      'CASH_DEPOSIT' => PrincipalDirection.collect,
      _ => PrincipalDirection.none,
    };

PrincipalDirection _collect(Map<String, Object?> _) => PrincipalDirection.collect;
PrincipalDirection _none(Map<String, Object?> _) => PrincipalDirection.none;

const serviceCodes = [
  'RECHARGE',
  'DMT',
  'BILL_PAYMENT',
  'PAN',
  'AADHAAR',
  'DOCUMENT',
  'AEPS',
  'MICRO_ATM',
  'ACCOUNT_OPENING',
  'CUSTOM',
];

final Map<String, ServiceDefinition> serviceRegistry = {
  'RECHARGE': ServiceDefinition(
    code: 'RECHARGE',
    category: 'PAYMENTS',
    workflowType: WorkflowType.transaction,
    icon: 'smartphone',
    accent: 'teal',
    principalLabelKey: 'record.principal.recharge',
    fields: [
      FieldDef(
        key: 'rechargeType',
        type: FieldType.select,
        labelKey: 'field.rechargeType',
        required: true,
        options: _opt(['PREPAID', 'DTH', 'FASTAG', 'DATACARD'], 'option.rechargeType'),
      ),
      FieldDef(
        key: 'operator',
        type: FieldType.select,
        labelKey: 'field.operator',
        required: true,
        options: _opt(
          ['AIRTEL', 'JIO', 'VI', 'BSNL', 'TATA_PLAY', 'DISH_TV', 'AIRTEL_DTH', 'SUN_DIRECT', 'D2H', 'OTHER'],
          'option.operator',
        ),
      ),
      const FieldDef(key: 'subscriberNumber', type: FieldType.text, labelKey: 'field.subscriberNumber', required: true, maxLength: 20, sensitive: true),
      const FieldDef(key: 'circle', type: FieldType.text, labelKey: 'field.circle', maxLength: 40),
    ],
    direction: _collect,
    dashboardWidgets: const ['volume', 'cashCollected'],
    providerCapable: true,
  ),
  'DMT': ServiceDefinition(
    code: 'DMT',
    category: 'BANKING',
    workflowType: WorkflowType.transaction,
    icon: 'send',
    accent: 'blue',
    principalLabelKey: 'record.principal.transfer',
    fields: [
      const FieldDef(key: 'senderName', type: FieldType.text, labelKey: 'field.senderName', maxLength: 80, guardSensitive: true),
      const FieldDef(key: 'senderMobile', type: FieldType.phone, labelKey: 'field.senderMobile', sensitive: true),
      const FieldDef(key: 'beneficiaryName', type: FieldType.text, labelKey: 'field.beneficiaryName', required: true, maxLength: 80, guardSensitive: true),
      const FieldDef(key: 'bankName', type: FieldType.text, labelKey: 'field.bankName', required: true, maxLength: 80),
      const FieldDef(key: 'accountLast4', type: FieldType.last4, labelKey: 'field.accountLast4', required: true, helpKey: 'help.accountLast4'),
      const FieldDef(key: 'ifsc', type: FieldType.ifsc, labelKey: 'field.ifsc'),
      FieldDef(key: 'transferMode', type: FieldType.select, labelKey: 'field.transferMode', options: _opt(['IMPS', 'NEFT', 'UPI'], 'option.transferMode')),
    ],
    direction: _collect,
    dashboardWidgets: const ['volume', 'cashCollected'],
    providerCapable: true,
    noticeKey: 'notice.dmt',
  ),
  'BILL_PAYMENT': ServiceDefinition(
    code: 'BILL_PAYMENT',
    category: 'PAYMENTS',
    workflowType: WorkflowType.transaction,
    icon: 'receipt',
    accent: 'amber',
    principalLabelKey: 'record.principal.bill',
    fields: [
      FieldDef(
        key: 'billCategory',
        type: FieldType.select,
        labelKey: 'field.billCategory',
        required: true,
        options: _opt(['ELECTRICITY', 'WATER', 'GAS', 'BROADBAND', 'POSTPAID', 'INSURANCE', 'LOAN_EMI', 'OTHER'], 'option.billCategory'),
      ),
      const FieldDef(key: 'billerName', type: FieldType.text, labelKey: 'field.billerName', required: true, maxLength: 80),
      const FieldDef(key: 'consumerId', type: FieldType.text, labelKey: 'field.consumerId', required: true, maxLength: 30, sensitive: true),
      const FieldDef(key: 'billDueDate', type: FieldType.date, labelKey: 'field.billDueDate'),
    ],
    direction: _collect,
    dashboardWidgets: const ['volume', 'cashCollected'],
    providerCapable: true,
  ),
  'PAN': ServiceDefinition(
    code: 'PAN',
    category: 'DOCUMENTS',
    workflowType: WorkflowType.application,
    icon: 'id-card',
    accent: 'violet',
    principalLabelKey: 'record.principal.govtFee',
    fields: [
      FieldDef(
        key: 'applicationType',
        type: FieldType.select,
        labelKey: 'field.panApplicationType',
        required: true,
        options: _opt(['NEW', 'CORRECTION', 'REPRINT', 'OTHER'], 'option.panApplicationType'),
      ),
      const FieldDef(key: 'applicantName', type: FieldType.text, labelKey: 'field.applicantName', required: true, maxLength: 80, guardSensitive: true),
      const FieldDef(key: 'acknowledgmentNo', type: FieldType.text, labelKey: 'field.acknowledgmentNo', maxLength: 40),
      const FieldDef(key: 'submittedOn', type: FieldType.date, labelKey: 'field.submittedOn'),
    ],
    direction: _collect,
    dashboardWidgets: const ['pendingApplications'],
    providerCapable: true,
  ),
  'AADHAAR': ServiceDefinition(
    code: 'AADHAAR',
    category: 'DOCUMENTS',
    workflowType: WorkflowType.application,
    icon: 'user-check',
    accent: 'coral',
    principalLabelKey: null,
    fields: [
      FieldDef(
        key: 'serviceCategory',
        type: FieldType.select,
        labelKey: 'field.aadhaarCategory',
        required: true,
        options: _opt(
          ['ENROLMENT', 'DEMOGRAPHIC_UPDATE', 'BIOMETRIC_UPDATE', 'DOCUMENT_UPDATE', 'STATUS_CHECK', 'OTHER'],
          'option.aadhaarCategory',
        ),
      ),
      const FieldDef(
        key: 'referenceNo',
        type: FieldType.text,
        labelKey: 'field.appointmentReference',
        maxLength: 40,
        guardSensitive: true,
        helpKey: 'help.noAadhaarNumber',
      ),
      const FieldDef(key: 'appointmentDate', type: FieldType.date, labelKey: 'field.appointmentDate'),
    ],
    direction: _none,
    dashboardWidgets: const ['pendingApplications'],
    providerCapable: false,
    noticeKey: 'notice.aadhaar',
  ),
  'DOCUMENT': ServiceDefinition(
    code: 'DOCUMENT',
    category: 'DOCUMENTS',
    workflowType: WorkflowType.application,
    icon: 'files',
    accent: 'green',
    principalLabelKey: 'record.principal.govtFee',
    fields: [
      FieldDef(
        key: 'documentCategory',
        type: FieldType.select,
        labelKey: 'field.documentCategory',
        required: true,
        options: _opt([
          'INCOME_CERTIFICATE',
          'CASTE_CERTIFICATE',
          'RESIDENCE_CERTIFICATE',
          'BIRTH_CERTIFICATE',
          'DEATH_CERTIFICATE',
          'RATION_CARD',
          'VOTER_ID',
          'PASSPORT',
          'DRIVING_LICENCE',
          'SCHOLARSHIP',
          'PENSION',
          'OTHER',
        ], 'option.documentCategory'),
      ),
      const FieldDef(key: 'department', type: FieldType.text, labelKey: 'field.department', required: true, maxLength: 80),
      const FieldDef(key: 'submissionRef', type: FieldType.text, labelKey: 'field.submissionRef', maxLength: 40),
      const FieldDef(key: 'checklist', type: FieldType.checklist, labelKey: 'field.checklist'),
    ],
    direction: _collect,
    dashboardWidgets: const ['pendingApplications'],
    providerCapable: false,
  ),
  'AEPS': ServiceDefinition(
    code: 'AEPS',
    category: 'BANKING',
    workflowType: WorkflowType.transaction,
    icon: 'hand-coins',
    accent: 'indigo',
    principalLabelKey: 'record.principal.aeps',
    fields: [
      FieldDef(key: 'operationType', type: FieldType.select, labelKey: 'field.operationType', required: true, options: _opt(aepsOperations, 'option.operationType')),
      const FieldDef(key: 'bankLabel', type: FieldType.text, labelKey: 'field.customerBank', maxLength: 80),
      const FieldDef(key: 'providerName', type: FieldType.text, labelKey: 'field.providerName', maxLength: 60),
    ],
    direction: _opDirection,
    dashboardWidgets: const ['volume', 'cashPayout'],
    providerCapable: true,
    noticeKey: 'notice.aeps',
  ),
  'MICRO_ATM': ServiceDefinition(
    code: 'MICRO_ATM',
    category: 'BANKING',
    workflowType: WorkflowType.transaction,
    icon: 'credit-card',
    accent: 'sky',
    principalLabelKey: 'record.principal.withdrawal',
    fields: [
      FieldDef(key: 'operationType', type: FieldType.select, labelKey: 'field.operationType', required: true, options: _opt(microAtmOperations, 'option.operationType')),
      const FieldDef(key: 'terminalRef', type: FieldType.text, labelKey: 'field.terminalRef', maxLength: 40),
      const FieldDef(key: 'providerName', type: FieldType.text, labelKey: 'field.providerName', maxLength: 60),
    ],
    direction: _opDirection,
    dashboardWidgets: const ['volume', 'cashPayout'],
    providerCapable: true,
    noticeKey: 'notice.microatm',
  ),
  'ACCOUNT_OPENING': ServiceDefinition(
    code: 'ACCOUNT_OPENING',
    category: 'BANKING',
    workflowType: WorkflowType.application,
    icon: 'landmark',
    accent: 'rose',
    principalLabelKey: null,
    fields: const [
      FieldDef(key: 'bankLabel', type: FieldType.text, labelKey: 'field.bankName', required: true, maxLength: 80),
      FieldDef(key: 'productLabel', type: FieldType.text, labelKey: 'field.productLabel', maxLength: 80),
      FieldDef(key: 'applicantName', type: FieldType.text, labelKey: 'field.applicantName', required: true, maxLength: 80, guardSensitive: true),
      FieldDef(key: 'applicationRef', type: FieldType.text, labelKey: 'field.applicationRef', maxLength: 40),
      FieldDef(key: 'submittedOn', type: FieldType.date, labelKey: 'field.submittedOn'),
      FieldDef(key: 'accountLast4', type: FieldType.last4, labelKey: 'field.accountLast4', helpKey: 'help.accountLast4'),
    ],
    direction: _none,
    dashboardWidgets: const ['pendingApplications'],
    providerCapable: false,
  ),
  'CUSTOM': const ServiceDefinition(
    code: 'CUSTOM',
    category: 'CUSTOM',
    workflowType: WorkflowType.transaction,
    icon: 'sparkles',
    accent: 'slate',
    principalLabelKey: 'record.principal.generic',
    fields: [],
    direction: _collect,
    dashboardWidgets: ['volume'],
    providerCapable: false,
  ),
};

ServiceDefinition? getService(String code) => serviceRegistry[code];

/// Lucide icon names (web) mapped to Material icons.
IconData serviceIcon(String lucideName) => switch (lucideName) {
      'smartphone' => Icons.smartphone_rounded,
      'send' => Icons.send_rounded,
      'receipt' => Icons.receipt_long_rounded,
      'id-card' => Icons.badge_rounded,
      'user-check' => Icons.how_to_reg_rounded,
      'files' => Icons.folder_copy_rounded,
      'hand-coins' => Icons.payments_rounded,
      'credit-card' => Icons.credit_card_rounded,
      'landmark' => Icons.account_balance_rounded,
      'sparkles' => Icons.auto_awesome_rounded,
      _ => Icons.apps_rounded,
    };

/// Custom service field definition (bounded; no executable expressions).
const customFieldTypes = {'text', 'number', 'date', 'select', 'boolean'};

/// Converts the API's custom field definitions into [FieldDef]s for rendering. Unknown or
/// malformed entries are skipped (the API validated them on save).
List<FieldDef> customFieldsToFieldDefs(List<Object?> raw) {
  final out = <FieldDef>[];
  for (final f in raw) {
    if (f is! Map) continue;
    final key = f['key'];
    final label = f['label'];
    final type = f['type'];
    if (key is! String || label is! String || type is! String || !customFieldTypes.contains(type)) continue;
    final ft = FieldType.values.byName(type);
    final options = (f['options'] is List) ? (f['options'] as List).whereType<String>().map((o) => FieldOption(o, o)).toList() : <FieldOption>[];
    out.add(FieldDef(
      key: key,
      type: ft,
      labelKey: label,
      required: f['required'] == true,
      options: options,
      maxLength: ft == FieldType.text ? 120 : null,
      guardSensitive: ft == FieldType.text,
      literalLabel: true,
    ));
  }
  return out;
}
