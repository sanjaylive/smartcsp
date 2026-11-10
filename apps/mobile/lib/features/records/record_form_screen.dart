import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';

import '../../core/dates.dart';
import '../../core/money.dart';
import '../../core/registry/field_validation.dart';
import '../../core/registry/services.dart';
import '../../core/status.dart';
import '../../data/api/api_exception.dart';
import '../../data/local/draft_store.dart';
import '../../data/models/record_models.dart';
import '../../data/models/tenant_models.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';
import '../../widgets/operator_badge.dart';
import '../payments/payment_widgets.dart';
import 'beneficiary_section.dart';
import 'live_section.dart';

const _uuid = Uuid();

/// Everything the form needs to know about the chosen service (built-in or custom).
class ResolvedService {
  const ResolvedService({
    required this.code,
    required this.workflow,
    required this.fields,
    required this.direction,
    this.principalLabelKey,
    this.customServiceId,
    this.customName,
    this.defaultFeePaise = 0,
  });

  final String code;
  final WorkflowType workflow;
  final List<FieldDef> fields;
  final PrincipalDirection Function(Map<String, Object?>) direction;
  final String? principalLabelKey;
  final String? customServiceId;
  final String? customName;
  final int defaultFeePaise;

  static ResolvedService? resolve(String code, {String? customId, TenantContext? ctx}) {
    if (code == 'CUSTOM') {
      CustomService? c;
      for (final x in ctx?.customServices ?? const <CustomService>[]) {
        if (x.id == customId) c = x;
      }
      if (c == null) return null;
      final dir = c.principalDirection;
      return ResolvedService(
        code: code,
        workflow: c.workflowType,
        fields: c.fields,
        direction: (_) => dir,
        principalLabelKey: 'record.principal.generic',
        customServiceId: c.id,
        customName: c.name,
        defaultFeePaise: c.defaultFeePaise,
      );
    }
    final def = getService(code);
    if (def == null) return null;
    return ResolvedService(
      code: code,
      workflow: def.workflowType,
      fields: def.fields,
      direction: def.direction,
      principalLabelKey: def.principalLabelKey,
    );
  }
}

class RecordFormScreen extends ConsumerWidget {
  const RecordFormScreen({super.key, required this.serviceCode, this.customServiceId, this.draftId});
  final String serviceCode;
  final String? customServiceId;
  final String? draftId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final ctxValue = ref.watch(tenantContextProvider);
    LocalDraft? draft;
    if (draftId != null) {
      for (final d in ref.read(syncProvider).drafts) {
        if (d.localId == draftId) draft = d;
      }
    }
    final code = draft?.data.serviceCode ?? serviceCode;
    final customId = draft?.data.customServiceId ?? customServiceId;
    final svc = ResolvedService.resolve(code, customId: customId, ctx: ctxValue.value);
    final title = svc?.customName ?? s.t('service.$code.name');

    Widget body;
    if (svc == null && code == 'CUSTOM' && ctxValue.isLoading) {
      body = const LoadingView();
    } else if (svc == null) {
      body = Center(child: EmptyView(message: s.t('error.SERVICE_NOT_AVAILABLE'), icon: Icons.block_rounded));
    } else {
      body = RecordForm(service: svc, draft: draft, ctx: ctxValue.value);
    }
    return Scaffold(appBar: AppBar(title: Text(title, overflow: TextOverflow.ellipsis)), body: body);
  }
}

class RecordForm extends ConsumerStatefulWidget {
  const RecordForm({super.key, required this.service, this.draft, this.ctx});
  final ResolvedService service;
  final LocalDraft? draft;
  final TenantContext? ctx;

  @override
  ConsumerState<RecordForm> createState() => _RecordFormState();
}

class _RecordFormState extends ConsumerState<RecordForm> {
  late final ResolvedService svc = widget.service;
  late final String _clientRef = widget.draft?.localId ?? _uuid.v4();
  String? _idemKey;
  String? _lastBody;

  final Map<String, TextEditingController> _text = {};
  final Map<String, Object?> _values = {};
  CustomerChoice? _customer;
  final _walkIn = TextEditingController();
  late String _txnDate;
  late String _opStatus;
  final _principal = TextEditingController();
  final _fee = TextEditingController();
  final _commission = TextEditingController();
  final _collected = TextEditingController();
  bool _collectedEdited = false;
  String _paymentMethod = 'CASH';
  String _principalMethod = 'CASH';
  final _externalRef = TextEditingController();
  final _notes = TextEditingController();
  String? _followUpDate;
  Map<String, String> _errors = {};
  String? _formError;
  bool _busy = false;
  String? _paymentAccountId;

  /// Live (Pay2All): offered when the owner set this service to Live in Integrations.
  bool get _liveCapable => widget.draft == null && const ['RECHARGE', 'BILL_PAYMENT'].contains(svc.code) && (widget.ctx?.service(svc.code)?.liveAvailable ?? false);
  /// The operator's Offline / Live choice; until they pick, Live is the default when available
  /// (the shop context can arrive after the form is first built).
  bool? _liveChoice;
  bool get _isLive => _liveChoice ?? _liveCapable;
  LiveState? _liveState;
  String? _liveError;
  String? _liveKey;
  String? _liveBody;

  @override
  void initState() {
    super.initState();
    final tz = widget.ctx?.tenant.timezone ?? defaultTimezone;
    final d = widget.draft?.data;
    _txnDate = d?.txnDate ?? todayIso(tz);
    _opStatus = d?.opStatus ?? defaultNewStatus(svc.workflow);
    if (!_statusOptions.contains(_opStatus)) _opStatus = defaultNewStatus(svc.workflow);
    for (final f in svc.fields) {
      final v = d?.details[f.key];
      if (_isTextLike(f.type)) _text[f.key] = TextEditingController(text: v?.toString() ?? '');
      if (f.type == FieldType.checklist) {
        _values[f.key] = v is List ? v.map(ChecklistItem.fromJson).toList() : <ChecklistItem>[];
      } else if (f.type == FieldType.boolean) {
        _values[f.key] = v is bool ? v : false;
      } else {
        _values[f.key] = v;
      }
    }
    if (d != null) {
      if (d.customerId != null) _customer = CustomerChoice(d.customerId!, d.customerName ?? '');
      _walkIn.text = d.walkInName ?? '';
      _principal.text = paiseToInput(d.principalPaise);
      _fee.text = paiseToInput(d.customerFeePaise);
      _commission.text = paiseToInput(d.expectedCommissionPaise);
      _collected.text = paiseToInput(d.amountCollectedPaise);
      _collectedEdited = true;
      _paymentMethod = d.paymentMethod;
      _paymentAccountId = d.paymentAccountId;
      _principalMethod = d.principalMethod;
      _externalRef.text = d.externalRef ?? '';
      _notes.text = d.notes ?? '';
      _followUpDate = d.followUpDate;
      _errors = _mapFieldErrors(widget.draft!.fieldErrors);
      if (widget.draft!.state == DraftState.failed) _formError = widget.draft!.lastErrorMessage;
    } else if (svc.defaultFeePaise > 0) {
      _fee.text = paiseToInput(svc.defaultFeePaise);
    }
    if (!_collectedEdited) _collected.text = paiseToInput(_receivable);
    for (final c in [_principal, _fee]) {
      c.addListener(_syncCollected);
    }
  }

  @override
  void dispose() {
    for (final c in [..._text.values, _walkIn, _principal, _fee, _commission, _collected, _externalRef, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  /// DMT gets the guided beneficiary section instead of plain fields.
  bool get _isDmt => svc.code == 'DMT' && beneficiaryKeys.every((k) => _text.containsKey(k));

  bool _isTextLike(FieldType t) =>
      t == FieldType.text || t == FieldType.number || t == FieldType.phone || t == FieldType.account || t == FieldType.ifsc;

  List<String> get _statusOptions => initialStatuses(svc.workflow).where((s) => s != 'DRAFT').toList();

  Map<String, Object?> get _currentValues => {
        for (final f in svc.fields) f.key: _isTextLike(f.type) ? _text[f.key]!.text : _values[f.key],
      };

  PrincipalDirection get _direction => svc.direction(_currentValues);
  bool get _showPrincipal => svc.principalLabelKey != null && _direction != PrincipalDirection.none;

  int _amount(TextEditingController c) => c.text.trim().isEmpty ? 0 : (parseRupeesToPaise(c.text) ?? 0);
  int get _principalPaise => _showPrincipal ? _amount(_principal) : 0;
  int get _receivable => receivableFor(_direction, _principalPaise, _amount(_fee));

  /// Until the operator edits it, "amount collected now" follows what the customer owes.
  /// After the recharge type changes: drop an operator that doesn't belong to it, and pick the only one if there is one.
  void _fitOperatorToType() {
    final allowed = rechargeOperatorsByType[_values['rechargeType']];
    if (allowed == null || !_values.containsKey('operator')) return;
    if (!allowed.contains(_values['operator'])) _values['operator'] = null;
    if (allowed.length == 1) _values['operator'] = allowed.single;
  }

  void _syncCollected() {
    if (_collectedEdited) return;
    final r = _receivable;
    final next = paiseToInput(r);
    if (_collected.text != next) _collected.text = next;
    if (mounted) setState(() {});
  }

  Map<String, String> _mapFieldErrors(Map<String, List<String>> fields) => {
        for (final e in fields.entries)
          if (e.value.isNotEmpty) e.key: e.value.first,
      };

  // ------------------------------------------------------------------ validation & build

  Map<String, String> _validate(AppStrings s) {
    final e = <String, String>{};
    validateDetails(svc.fields, _currentValues).forEach((k, i) => e['details.$k'] = s.issue(i));
    void put(String k, ValidationIssue? i) {
      if (i != null) e[k] = s.issue(i);
    }

    if (_customer == null) put('walkInName', validateSafeText(_walkIn.text, max: 80));
    put('notes', validateSafeText(_notes.text, max: 1000));
    if (_externalRef.text.trim().length > 60) e['externalRef'] = s.t('validation.maxLength', {'max': 60});
    for (final (key, c) in [('principalPaise', _principal), ('customerFeePaise', _fee), ('expectedCommissionPaise', _commission), ('amountCollectedPaise', _collected)]) {
      if (key == 'principalPaise' && !_showPrincipal) continue;
      if (c.text.trim().isNotEmpty && parseRupeesToPaise(c.text) == null) e[key] = s.t('validation.amount');
    }
    final collected = _amount(_collected);
    if (!e.containsKey('amountCollectedPaise') && collected > _receivable) e['amountCollectedPaise'] = s.t('error.AMOUNT_EXCEEDS_DUE');
    if (collected > 0 && _paymentMethod == 'NONE') e['paymentMethod'] = s.t('common.required');
    if (!isIsoDate(_txnDate)) e['txnDate'] = s.t('validation.date');
    return e;
  }

  RecordDraftData _build({required bool post}) => RecordDraftData(
        serviceCode: svc.code,
        customServiceId: svc.customServiceId,
        customerId: _customer?.id,
        customerName: _customer?.name,
        walkInName: _customer == null ? _walkIn.text : null,
        txnDate: _txnDate,
        opStatus: _opStatus,
        principalPaise: _principalPaise,
        customerFeePaise: _amount(_fee),
        expectedCommissionPaise: _amount(_commission),
        paymentMethod: _amount(_collected) == 0 && _paymentMethod == 'NONE' ? 'NONE' : _paymentMethod,
        paymentAccountId: _paymentAccountId,
        amountCollectedPaise: _amount(_collected),
        principalMethod: _principalMethod,
        externalRef: _externalRef.text,
        notes: _notes.text,
        followUpDate: _followUpDate,
        details: buildDetailsJson(svc.fields, _currentValues),
        post: post,
      );

  bool _check() {
    final s = context.s;
    final errors = _validate(s);
    setState(() {
      _errors = errors;
      _formError = errors.isEmpty ? null : s.t('error.VALIDATION_FAILED');
    });
    return errors.isEmpty;
  }

  // ------------------------------------------------------------------ actions

  /// Live section changed: copy its choices into the record details and amount.
  void _onLive(LiveState st) {
    setState(() {
      _liveState = st;
      _liveError = null;
      st.details.forEach((k, v) {
        if (_text.containsKey(k)) {
          if (_text[k]!.text != v) _text[k]!.text = v;
        } else if (_values.containsKey(k)) {
          _values[k] = v.isEmpty ? null : v;
        }
        _errors.remove('details.$k');
      });
    });
    if (st.amountPaise != null && st.amountPaise! > 0) _principal.text = paiseToInput(st.amountPaise!);
  }

  /// Sends a Live recharge / bill payment through Pay2All after the operator confirms.
  Future<void> _submitLive() async {
    final s = context.s;
    final st = _liveState;
    if (st == null || !st.ready) {
      setState(() => _liveError = st?.problem ?? s.t('mobile.live.fillFirst'));
      return;
    }
    if (!_check()) return;
    final data = _build(post: false);
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(s.t(svc.code == 'BILL_PAYMENT' ? 'mobile.live.confirmBill' : 'mobile.live.confirmRecharge')),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(s.t('mobile.live.confirmBody'), style: TextStyle(color: context.tokens.textMuted)),
          const SizedBox(height: Tokens.s3),
          if (svc.code == 'RECHARGE') ...[
            KeyValueRow(label: s.t('mobile.live.mobileNumber'), value: '${data.details['subscriberNumber'] ?? ''}'),
            KeyValueRow(label: s.t('field.operator'), value: s.t('option.operator.${data.details['operator'] ?? 'OTHER'}')),
          ] else ...[
            KeyValueRow(label: s.t('mobile.live.biller'), value: '${data.details['billerName'] ?? ''}'),
            KeyValueRow(label: s.t('field.consumerId'), value: '${data.details['consumerId'] ?? ''}'),
          ],
          KeyValueRow(label: s.t(svc.principalLabelKey ?? 'record.principal.generic'), value: '', valueWidget: MoneyText(data.principalPaise)),
          KeyValueRow(label: s.t('mobile.record.receivable'), value: '', valueWidget: MoneyText(_receivable)),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: Text(s.t('common.back'))),
          FilledButton.icon(key: const Key('live.confirm'), onPressed: () => Navigator.pop(d, true), icon: const Icon(Icons.bolt_rounded), label: Text(s.t('mobile.live.confirmSend'))),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final body = jsonEncode({...data.toApiJson(), 'live': st.live});
    if (body != _liveBody) {
      _liveKey = _uuid.v4();
      _liveBody = body;
    }
    setState(() => _busy = true);
    try {
      final op = await ref.read(apiProvider).executeLive(data, st.live, idempotencyKey: _liveKey!);
      ref.invalidate(dashboardProvider);
      ref.invalidate(tenantContextProvider);
      if (!mounted) return;
      await showLiveResult(context, ref, op);
      if (mounted) context.pushReplacement('/records/${op.record.id}');
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _errors = _mapFieldErrors(e.fields);
        _formError = e.isNetwork ? s.t('mobile.live.offline') : errorText(context, e);
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitOnline({required bool post}) async {
    if (!_check()) return;
    final s = context.s;
    final data = _build(post: post);
    final body = jsonEncode(data.toApiJson(clientRef: _clientRef));
    if (body != _lastBody) {
      // A changed form is a new submission; an unchanged retry reuses the key.
      _idemKey = _uuid.v4();
      _lastBody = body;
    }
    setState(() => _busy = true);
    try {
      final rec = await ref.read(apiProvider).createRecord(data, clientRef: _clientRef, idempotencyKey: _idemKey!);
      ref.invalidate(dashboardProvider);
      ref.invalidate(tenantContextProvider);
      if (!mounted) return;
      showSnack(context, rec.duplicate ? s.t('mobile.record.duplicate', {'no': rec.recordNo}) : s.t('mobile.record.saved', {'no': rec.recordNo}));
      context.pushReplacement('/records/${rec.id}');
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isNetwork) {
        // Could not reach the server: keep the work as a device draft with the SAME clientRef, so
        // if the request did land, syncing returns the original record instead of a duplicate.
        await _saveDraft(fromNetworkError: true);
        return;
      }
      setState(() {
        _errors = _mapFieldErrors(e.fields);
        _formError = errorText(context, e);
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveDraft({bool fromNetworkError = false}) async {
    if (!_check()) return;
    final s = context.s;
    final data = _build(post: false);
    setState(() => _busy = true);
    try {
      await ref.read(syncProvider.notifier).saveDraft(data, localId: _clientRef);
      if (!mounted) return;
      showSnack(context, fromNetworkError ? '${s.t('error.NETWORK')} ${s.t('mobile.drafts.saved')}' : s.t('mobile.drafts.saved'));
      if (widget.draft != null) {
        context.pop();
      } else {
        context.pushReplacement('/drafts');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _preview() async {
    if (!_check()) return;
    final s = context.s;
    try {
      final p = await ref.read(apiProvider).postingPreview(_build(post: false));
      if (!mounted) return;
      await showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (sheet) => SafeArea(
          child: ListView(shrinkWrap: true, padding: const EdgeInsets.all(Tokens.s4), children: [
            Text(s.t('record.cashPreview'), style: Theme.of(sheet).textTheme.titleMedium),
            const SizedBox(height: Tokens.s2),
            KeyValueRow(label: s.t('mobile.record.receivable'), value: formatInr(p.receivablePaise)),
            KeyValueRow(label: s.t('mobile.record.due'), value: formatInr(p.amountDuePaise)),
            KeyValueRow(label: s.t('mobile.record.cashEffect'), value: formatInr(p.cashEffectPaise, signed: true)),
            const Divider(),
            for (final l in p.lines)
              KeyValueRow(
                label: '${s.has('account.${l.account}') ? s.t('account.${l.account}') : l.account}${l.memo != null ? ' — ${l.memo}' : ''}',
                value: l.debitPaise > 0 ? '${s.t('cashbook.in')} ${formatInr(l.debitPaise)}' : '${s.t('cashbook.out')} ${formatInr(l.creditPaise)}',
              ),
          ]),
        ),
      );
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.isNetwork ? s.t('mobile.record.previewOffline') : errorText(context, e), error: true);
    }
  }

  Future<void> _pickDate(String current, ValueChanged<String> onPicked) async {
    final initial = parseIsoDate(current) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) onPicked(toIsoDate(picked));
  }

  Future<void> _chooseCustomer() async {
    final picked = await context.push<CustomerChoice>('/customers/pick');
    if (picked != null) setState(() => _customer = picked);
  }

  // ------------------------------------------------------------------ UI

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final online = ref.watch(onlineProvider).value ?? true;
    final ctx = widget.ctx;
    final canPost = ctx?.can('records.post') ?? false;
    final postable = isPostableStatus(svc.workflow, _opStatus);
    final isDraftEdit = widget.draft != null;
    final live = _isLive && _liveCapable;
    final collected = _amount(_collected);
    final due = (_receivable - collected).clamp(0, maxPaise);
    final cash = cashEffect(
      direction: _direction,
      principal: _principalPaise,
      collected: collected,
      paymentMethod: _paymentMethod,
      principalMethod: _principalMethod,
    );

    return Column(children: [
      Expanded(
        child: ListView(
          padding: const EdgeInsets.all(Tokens.s4),
          children: [
            if (isDraftEdit) ...[
              InfoBanner(text: s.t('mobile.draftNotConfirmed'), tone: BannerTone.warning, icon: Icons.phone_android_rounded),
              const SizedBox(height: Tokens.s2),
            ],
            if (!online && !isDraftEdit) ...[
              InfoBanner(text: s.t('mobile.record.offlineNotice'), tone: BannerTone.warning, icon: Icons.wifi_off_rounded),
              const SizedBox(height: Tokens.s2),
            ],
            InfoBanner(text: s.t('record.manualNotice')),
            if (_formError != null) ...[
              const SizedBox(height: Tokens.s2),
              InfoBanner(key: const Key('record.formError'), text: _formError!, tone: BannerTone.danger),
            ],
            SectionTitle(s.t('record.customer')),
            _customerSection(s),
            SectionTitle(s.t('common.details')),
            if (_liveCapable) ...[
              LiveModeSwitch(live: _isLive, onChanged: (v) => setState(() => _liveChoice = v)),
              const SizedBox(height: Tokens.s2),
              Text(s.t(live ? 'mobile.live.liveHelp' : 'mobile.live.offlineHelp'), style: TextStyle(color: context.tokens.textMuted, fontSize: 13)),
              const SizedBox(height: Tokens.s3),
            ],
            if (live) ...[
              if (!online) ...[
                InfoBanner(text: s.t('mobile.live.offline'), tone: BannerTone.warning, icon: Icons.wifi_off_rounded),
                const SizedBox(height: Tokens.s3),
              ],
              if (svc.code == 'RECHARGE')
                RechargeLive(onChanged: _onLive, amountPaise: _principalPaise)
              else
                BillLive(onChanged: _onLive),
              if (_liveError != null) ...[
                const SizedBox(height: Tokens.s2),
                InfoBanner(key: const Key('live.error'), text: _liveError!, tone: BannerTone.danger),
              ],
              const SizedBox(height: Tokens.s3),
            ],
            _dateField(
              key: 'txnDate',
              label: svc.workflow == WorkflowType.application ? s.t('record.applicationDate') : s.t('record.txnDate'),
              value: _txnDate,
              onPicked: (v) => setState(() => _txnDate = v),
            ),
            const SizedBox(height: Tokens.s3),
            if (!live) DropdownButtonFormField<String>(
              key: const Key('record.status'),
              initialValue: _opStatus,
              isExpanded: true,
              decoration: InputDecoration(labelText: s.t('common.status'), helperText: _opStatus == 'SUCCESSFUL' ? s.t('record.reportedSuccess') : null),
              items: [for (final st in _statusOptions) DropdownMenuItem(value: st, child: Text(s.t('status.$st')))],
              onChanged: (v) => setState(() => _opStatus = v ?? _opStatus),
            ),
            const SizedBox(height: Tokens.s3),
            if (svc.fields.isEmpty) Text(s.t('mobile.record.noFields'), style: TextStyle(color: context.tokens.textMuted)),
            for (final f in live ? const <FieldDef>[] : svc.fields)
              if (_isDmt && f.key == beneficiaryKeys.first) ...[
                const SizedBox(height: Tokens.s2),
                BeneficiarySection(
                  controllers: {for (final k in beneficiaryKeys) k: _text[k]!},
                  errors: _errors,
                  onEdited: (k) => setState(() => _errors.remove('details.$k')),
                  customerId: _customer?.id,
                  canSave: (ctx?.can('customers.manage') ?? false),
                ),
                const SizedBox(height: Tokens.s3),
              ] else if (!(_isDmt && beneficiaryKeys.contains(f.key))) ...[_fieldWidget(s, f), const SizedBox(height: Tokens.s3)],
            SectionTitle(s.t('mobile.record.amounts')),
            if (_showPrincipal) ...[
              _amountField('principalPaise', _principal, s.t(svc.principalLabelKey!)),
              if (_principalPaise > 0) ...[
                const SizedBox(height: Tokens.s3),
                _methodDropdown(
                  'principalMethod',
                  s.t('mobile.record.principalMethod'),
                  _principalMethod,
                  const ['CASH', 'UPI', 'BANK'],
                  (v) => setState(() => _principalMethod = v),
                ),
              ],
              const SizedBox(height: Tokens.s3),
            ],
            _amountField('customerFeePaise', _fee, s.t('record.customerFee')),
            const SizedBox(height: Tokens.s3),
            _amountField('expectedCommissionPaise', _commission, '${s.t('record.expectedCommission')} (${s.t('common.optional')})'),
            const SizedBox(height: Tokens.s3),
            _amountField('amountCollectedPaise', _collected, s.t('record.amountCollected'), onEdited: () => _collectedEdited = true),
            const SizedBox(height: Tokens.s3),
            _methodDropdown(
              'paymentMethod',
              s.t('record.paymentMethod'),
              _paymentMethod,
              const ['CASH', 'UPI', 'BANK', 'NONE'],
              (v) => setState(() => _paymentMethod = v),
            ),
            if ((_paymentMethod == 'UPI' || _paymentMethod == 'BANK') && collected > 0) ...[
              const SizedBox(height: Tokens.s3),
              CollectPanel(
                method: _paymentMethod,
                amountPaise: collected,
                accountId: _paymentAccountId,
                onAccount: (id) => setState(() => _paymentAccountId = id),
                note: s.t('service.${svc.code}.name'),
                canManage: ctx?.can('settings.manage') ?? false,
              ),
            ],
            const SizedBox(height: Tokens.s3),
            AppCard(
              color: context.tokens.surfaceMuted,
              child: Column(children: [
                KeyValueRow(label: s.t('mobile.record.receivable'), value: '', valueWidget: MoneyText(_receivable)),
                KeyValueRow(label: s.t('mobile.record.due'), value: '', valueWidget: MoneyText(due, color: due > 0 ? context.tokens.warning : null)),
                KeyValueRow(label: s.t('mobile.record.cashEffect'), value: '', valueWidget: MoneyText(cash, signed: true)),
                if (online)
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton.icon(onPressed: _busy ? null : _preview, icon: const Icon(Icons.visibility_outlined), label: Text(s.t('record.cashPreview'))),
                  ),
              ]),
            ),
            SectionTitle(s.t('common.notes')),
            TextField(
              controller: _externalRef,
              maxLength: 60,
              decoration: InputDecoration(
                labelText: '${s.t('record.externalRef')} (${s.t('common.optional')})',
                helperText: s.t('record.externalRefHelp'),
                errorText: _errors['externalRef'],
                counterText: '',
              ),
            ),
            const SizedBox(height: Tokens.s3),
            TextField(
              key: const Key('record.notes'),
              controller: _notes,
              maxLines: 3,
              maxLength: 1000,
              decoration: InputDecoration(labelText: '${s.t('common.notes')} (${s.t('common.optional')})', errorText: _errors['notes'], counterText: ''),
            ),
            const SizedBox(height: Tokens.s3),
            _dateField(
              key: 'followUpDate',
              label: '${s.t('record.followUpDate')} (${s.t('common.optional')})',
              value: _followUpDate ?? '',
              onPicked: (v) => setState(() => _followUpDate = v),
              onClear: _followUpDate == null ? null : () => setState(() => _followUpDate = null),
            ),
            const SizedBox(height: Tokens.s6),
          ],
        ),
      ),
      if (live) _liveActions(s, online: online) else _actions(s, online: online, canPost: canPost && postable, isDraftEdit: isDraftEdit),
    ]);
  }

  Widget _liveActions(AppStrings s, {required bool online}) => Container(
        padding: const EdgeInsets.fromLTRB(Tokens.s4, Tokens.s3, Tokens.s4, Tokens.s3),
        decoration: BoxDecoration(color: context.tokens.surface, border: Border(top: BorderSide(color: context.tokens.border))),
        child: SafeArea(
          top: false,
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Text(s.t('mobile.record.receivable'), style: TextStyle(color: context.tokens.textMuted, fontSize: 12)),
                MoneyText(_receivable, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              ]),
            ),
            FilledButton.icon(
              key: const Key('live.send'),
              onPressed: _busy || !online ? null : _submitLive,
              icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Icon(Icons.bolt_rounded),
              label: Text(s.t(svc.code == 'BILL_PAYMENT' ? 'mobile.live.payNow' : 'mobile.live.rechargeNow')),
            ),
          ]),
        ),
      );

  Widget _actions(AppStrings s, {required bool online, required bool canPost, required bool isDraftEdit}) {
    final spinner = const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5));
    final draftButton = OutlinedButton.icon(
      key: const Key('record.saveDraft'),
      onPressed: _busy ? null : _saveDraft,
      icon: const Icon(Icons.phone_android_rounded),
      label: Text(isDraftEdit ? s.t('mobile.drafts.edit') : s.t('mobile.record.saveDraft')),
    );
    return Container(
      padding: const EdgeInsets.fromLTRB(Tokens.s4, Tokens.s3, Tokens.s4, Tokens.s3),
      decoration: BoxDecoration(color: context.tokens.surface, border: Border(top: BorderSide(color: context.tokens.border))),
      child: SafeArea(
        top: false,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          if (isDraftEdit || !online)
            FilledButton.icon(
              key: const Key('record.saveDraftPrimary'),
              onPressed: _busy ? null : _saveDraft,
              icon: _busy ? spinner : const Icon(Icons.save_alt_rounded),
              label: Text(isDraftEdit ? s.t('mobile.drafts.edit') : s.t('mobile.record.saveDraft')),
            )
          else ...[
            Row(children: [
              Expanded(
                child: FilledButton(
                  key: const Key('record.save'),
                  onPressed: _busy ? null : () => _submitOnline(post: false),
                  child: _busy ? spinner : Text(s.t('mobile.record.save')),
                ),
              ),
              if (canPost) ...[
                const SizedBox(width: Tokens.s2),
                Expanded(
                  child: FilledButton.tonal(
                    key: const Key('record.saveAndPost'),
                    style: FilledButton.styleFrom(minimumSize: const Size(64, Tokens.touchTarget)),
                    onPressed: _busy ? null : () => _submitOnline(post: true),
                    child: Text(s.t('mobile.record.saveAndPost'), textAlign: TextAlign.center, maxLines: 2),
                  ),
                ),
              ],
            ]),
            const SizedBox(height: Tokens.s2),
            draftButton,
          ],
        ]),
      ),
    );
  }

  Widget _customerSection(AppStrings s) {
    if (_customer != null) {
      return AppCard(
        padding: const EdgeInsets.symmetric(horizontal: Tokens.s3, vertical: Tokens.s2),
        child: Row(children: [
          const Icon(Icons.person_rounded),
          const SizedBox(width: Tokens.s3),
          Expanded(child: Text(_customer!.name, style: const TextStyle(fontWeight: FontWeight.w600))),
          TextButton(onPressed: _chooseCustomer, child: Text(s.t('mobile.record.change'))),
          IconButton(
            tooltip: s.t('mobile.customer.useWalkIn'),
            icon: const Icon(Icons.close_rounded),
            onPressed: () => setState(() => _customer = null),
          ),
        ]),
      );
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      OutlinedButton.icon(
        key: const Key('record.pickCustomer'),
        onPressed: _chooseCustomer,
        icon: const Icon(Icons.person_search_rounded),
        label: Text(s.t('mobile.record.selectCustomer')),
      ),
      const SizedBox(height: Tokens.s3),
      TextField(
        key: const Key('record.walkIn'),
        controller: _walkIn,
        maxLength: 80,
        textCapitalization: TextCapitalization.words,
        decoration: InputDecoration(
          labelText: '${s.t('mobile.record.walkInName')} (${s.t('common.optional')})',
          errorText: _errors['walkInName'] ?? _errors['customerId'],
          counterText: '',
          prefixIcon: const Icon(Icons.directions_walk_rounded),
        ),
      ),
    ]);
  }

  Widget _dateField({required String key, required String label, required String value, required ValueChanged<String> onPicked, VoidCallback? onClear}) =>
      InkWell(
        key: Key('record.$key'),
        borderRadius: BorderRadius.circular(Tokens.radiusMd),
        onTap: () => _pickDate(value, onPicked),
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            errorText: _errors[key],
            suffixIcon: onClear != null
                ? IconButton(tooltip: s.t('mobile.common.clear'), icon: const Icon(Icons.clear_rounded), onPressed: onClear)
                : const Icon(Icons.calendar_today_rounded),
          ),
          child: Text(value.isEmpty ? '—' : formatDate(value)),
        ),
      );

  AppStrings get s => context.s;

  Widget _amountField(String key, TextEditingController c, String label, {VoidCallback? onEdited}) => TextField(
        key: Key('record.$key'),
        controller: c,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
        style: const TextStyle(fontFeatures: moneyFeatures),
        onChanged: (_) {
          onEdited?.call();
          setState(() {});
        },
        decoration: InputDecoration(labelText: label, prefixText: '₹ ', hintText: '0.00', errorText: _errors[key]),
      );

  Widget _methodDropdown(String key, String label, String value, List<String> options, ValueChanged<String> onChanged) =>
      DropdownButtonFormField<String>(
        key: Key('record.$key'),
        initialValue: options.contains(value) ? value : options.first,
        isExpanded: true,
        decoration: InputDecoration(labelText: label, errorText: _errors[key]),
        items: [for (final o in options) DropdownMenuItem(value: o, child: Text(s.t('method.$o')))],
        onChanged: (v) => onChanged(v ?? value),
      );

  Widget _fieldWidget(AppStrings s, FieldDef f) {
    final label = '${s.label(f.labelKey, literal: f.literalLabel)}${f.required || f.type == FieldType.boolean || f.type == FieldType.checklist ? '' : ' (${s.t('common.optional')})'}';
    final help = f.helpKey != null ? s.t(f.helpKey!) : null;
    final error = _errors['details.${f.key}'];
    final key = Key('field.${f.key}');
    void changed(_) => setState(() => _errors.remove('details.${f.key}'));

    switch (f.type) {
      case FieldType.text:
        return TextField(
          key: key,
          controller: _text[f.key],
          maxLength: f.maxLength ?? 120,
          onChanged: changed,
          decoration: InputDecoration(labelText: label, helperText: help, errorText: error, counterText: ''),
        );
      case FieldType.number:
        return TextField(
          key: key,
          controller: _text[f.key],
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
          onChanged: changed,
          decoration: InputDecoration(labelText: label, helperText: help, errorText: error),
        );
      case FieldType.phone:
        return TextField(
          key: key,
          controller: _text[f.key],
          keyboardType: TextInputType.phone,
          maxLength: 10,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          onChanged: changed,
          decoration: InputDecoration(labelText: label, helperText: help, errorText: error, counterText: '', prefixText: '+91 '),
        );
      case FieldType.account:
        return TextField(
          key: key,
          controller: _text[f.key],
          keyboardType: TextInputType.number,
          maxLength: 18,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          onChanged: changed,
          decoration: InputDecoration(labelText: label, helperText: help, errorText: error, counterText: ''),
        );
      case FieldType.ifsc:
        return TextField(
          key: key,
          controller: _text[f.key],
          maxLength: 11,
          textCapitalization: TextCapitalization.characters,
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]')), _UpperCase()],
          onChanged: changed,
          decoration: InputDecoration(labelText: label, helperText: help ?? 'SBIN0001234', errorText: error, counterText: ''),
        );
      case FieldType.date:
        final v = (_values[f.key] as String?) ?? '';
        return InkWell(
          key: key,
          borderRadius: BorderRadius.circular(Tokens.radiusMd),
          onTap: () => _pickDate(v, (d) => setState(() {
                _values[f.key] = d;
                _errors.remove('details.${f.key}');
              })),
          child: InputDecorator(
            decoration: InputDecoration(
              labelText: label,
              helperText: help,
              errorText: error,
              suffixIcon: v.isEmpty
                  ? const Icon(Icons.calendar_today_rounded)
                  : IconButton(tooltip: s.t('mobile.common.clear'), icon: const Icon(Icons.clear_rounded), onPressed: () => setState(() => _values[f.key] = null)),
            ),
            child: Text(v.isEmpty ? '—' : formatDate(v)),
          ),
        );
      case FieldType.select:
        final v = _values[f.key] as String?;
        final options = visibleOptions(f, _values);
        return DropdownButtonFormField<String>(
          // The operator list depends on the recharge type, so rebuild it when that changes.
          key: f.key == 'operator' ? ValueKey('field.operator.${_values['rechargeType']}') : key,
          initialValue: options.any((o) => o.value == v) ? v : null,
          isExpanded: true,
          decoration: InputDecoration(labelText: label, helperText: help, errorText: error),
          hint: Text(s.t('mobile.common.select')),
          items: [
            for (final o in options)
              DropdownMenuItem(
                value: o.value,
                child: f.key == 'operator'
                    ? OperatorOption(codeOrName: o.value, label: s.label(o.labelKey, literal: f.literalLabel))
                    : Text(s.label(o.labelKey, literal: f.literalLabel)),
              ),
          ],
          onChanged: (x) {
            setState(() {
              _values[f.key] = x;
              _errors.remove('details.${f.key}');
              if (f.key == 'rechargeType') _fitOperatorToType();
            });
            _syncCollected(); // AEPS/MicroATM operation changes the principal direction
          },
        );
      case FieldType.boolean:
        return SwitchListTile(
          key: key,
          contentPadding: EdgeInsets.zero,
          title: Text(label),
          subtitle: error != null ? Text(error, style: TextStyle(color: context.tokens.danger)) : null,
          value: _values[f.key] == true,
          onChanged: (x) => setState(() => _values[f.key] = x),
        );
      case FieldType.checklist:
        final items = (_values[f.key] as List<ChecklistItem>?) ?? <ChecklistItem>[];
        return _ChecklistEditor(
          key: key,
          label: label,
          error: error,
          items: items,
          onChanged: (next) => setState(() {
            _values[f.key] = next;
            _errors.remove('details.${f.key}');
          }),
        );
    }
  }
}

/// A chosen customer (id + display name), returned by the customer picker.
class CustomerChoice {
  const CustomerChoice(this.id, this.name);
  final String id;
  final String name;
}

class _UpperCase extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) => newValue.copyWith(text: newValue.text.toUpperCase());
}

class _ChecklistEditor extends StatefulWidget {
  const _ChecklistEditor({super.key, required this.label, required this.items, required this.onChanged, this.error});
  final String label;
  final String? error;
  final List<ChecklistItem> items;
  final ValueChanged<List<ChecklistItem>> onChanged;

  @override
  State<_ChecklistEditor> createState() => _ChecklistEditorState();
}

class _ChecklistEditorState extends State<_ChecklistEditor> {
  final _input = TextEditingController();

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  void _add() {
    final t = _input.text.trim();
    if (t.isEmpty || widget.items.length >= 20) return;
    widget.onChanged([...widget.items, ChecklistItem(t, false)]);
    _input.clear();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    return InputDecorator(
      decoration: InputDecoration(labelText: widget.label, errorText: widget.error),
      child: Column(children: [
        for (var i = 0; i < widget.items.length; i++)
          Row(children: [
            Checkbox(
              value: widget.items[i].done,
              onChanged: (v) => widget.onChanged([
                for (var j = 0; j < widget.items.length; j++) j == i ? ChecklistItem(widget.items[j].label, v ?? false) : widget.items[j],
              ]),
            ),
            Expanded(child: Text(widget.items[i].label)),
            IconButton(
              tooltip: s.t('mobile.common.delete'),
              icon: const Icon(Icons.delete_outline_rounded),
              onPressed: () => widget.onChanged([...widget.items]..removeAt(i)),
            ),
          ]),
        Row(children: [
          Expanded(
            child: TextField(
              controller: _input,
              maxLength: 60,
              onSubmitted: (_) => _add(),
              decoration: InputDecoration(hintText: s.t('mobile.record.checklistItem'), counterText: '', isDense: true),
            ),
          ),
          IconButton(tooltip: s.t('mobile.record.checklistAdd'), icon: const Icon(Icons.add_circle_outline_rounded), onPressed: _add),
        ]),
      ]),
    );
  }
}
