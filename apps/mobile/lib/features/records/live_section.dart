import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/money.dart';
import '../../data/api/api_exception.dart';
import '../../data/models/json.dart';
import '../../data/models/payment_models.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

/// What the Live section hands back to the record form.
class LiveState {
  const LiveState({required this.live, required this.details, this.amountPaise, required this.ready, this.problem});

  /// Ids for `POST /v1/provider-operations` → `live`.
  final Json live;

  /// Record detail fields derived from the Pay2All choices.
  final Map<String, String> details;

  /// Amount to pre-fill (plan price / bill amount).
  final int? amountPaise;
  final bool ready;
  final String? problem;
}

const _operatorEnum = <(String, String)>[
  (r'airtel.*(dth|digital)', 'AIRTEL_DTH'),
  (r'tata\s*(play|sky)', 'TATA_PLAY'),
  (r'dish', 'DISH_TV'),
  (r'sun', 'SUN_DIRECT'),
  (r'd2h|videocon', 'D2H'),
  (r'airtel', 'AIRTEL'),
  (r'jio', 'JIO'),
  (r'\bvi\b|vodafone|idea', 'VI'),
  (r'bsnl|mtnl', 'BSNL'),
];
String operatorEnum(String name) {
  for (final (re, v) in _operatorEnum) {
    if (RegExp(re, caseSensitive: false).hasMatch(name)) return v;
  }
  return 'OTHER';
}

const _billEnum = <(String, String)>[
  (r'electric|power', 'ELECTRICITY'),
  (r'water', 'WATER'),
  (r'gas|lpg|piped', 'GAS'),
  (r'broadband|landline|internet', 'BROADBAND'),
  (r'postpaid|mobile', 'POSTPAID'),
  (r'insurance|lic', 'INSURANCE'),
  (r'loan|emi', 'LOAN_EMI'),
];
String billEnum(String name) {
  for (final (re, v) in _billEnum) {
    if (RegExp(re, caseSensitive: false).hasMatch(name)) return v;
  }
  return 'OTHER';
}

/// "2026-11-30", "30-11-2026", "30/11/2026" → ISO date.
String? isoDateOf(String? v) {
  if (v == null) return null;
  final iso = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(v);
  if (iso != null) return '${iso[1]}-${iso[2]}-${iso[3]}';
  final dmy = RegExp(r'^(\d{2})[-/](\d{2})[-/](\d{4})$').firstMatch(v);
  if (dmy != null) return '${dmy[3]}-${dmy[2]}-${dmy[1]}';
  return null;
}

/// Offline / Live switch shown at the top of the record when the owner made the service Live.
class LiveModeSwitch extends StatelessWidget {
  const LiveModeSwitch({super.key, required this.live, required this.onChanged});
  final bool live;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    return SegmentedButton<bool>(
      key: const Key('record.liveSwitch'),
      segments: [
        ButtonSegment(value: false, icon: const Icon(Icons.edit_note_rounded), label: Text(s.t('mobile.p2a.offline'))),
        ButtonSegment(value: true, icon: const Icon(Icons.bolt_rounded), label: Text(s.t('mobile.live.livePay2all'))),
      ],
      selected: {live},
      onSelectionChanged: (v) => onChanged(v.first),
    );
  }
}

// ------------------------------------------------------------------------------------ recharge

class RechargeLive extends ConsumerStatefulWidget {
  const RechargeLive({super.key, required this.onChanged, required this.amountPaise});
  final ValueChanged<LiveState> onChanged;
  final int amountPaise;

  @override
  ConsumerState<RechargeLive> createState() => _RechargeLiveState();
}

class _RechargeLiveState extends ConsumerState<RechargeLive> {
  String _kind = 'PREPAID';
  final _number = TextEditingController();
  int? _providerId;
  String? _circleId;
  String? _circleName;
  String? _detected;
  bool _looking = false;
  String? _lookupFor;

  @override
  void dispose() {
    _number.dispose();
    super.dispose();
  }

  bool get _validNumber => _kind == 'PREPAID' ? RegExp(r'^[6-9]\d{9}$').hasMatch(_number.text) : RegExp(r'^\d{6,16}$').hasMatch(_number.text);

  List<P2AOperator> _operators(List<P2AOperator> all) {
    final want = RegExp(_kind == 'DTH' ? 'dth' : 'prepaid|mobile', caseSensitive: false);
    final list = all.where((o) => want.hasMatch(o.service) && !RegExp('postpaid', caseSensitive: false).hasMatch(o.service)).toList();
    return list.isEmpty ? all : list;
  }

  void _emit({int? amountPaise}) {
    final s = context.s;
    final all = ref.read(p2aOperatorsProvider).value ?? const <P2AOperator>[];
    P2AOperator? op;
    for (final o in all) {
      if (o.id == _providerId) op = o;
    }
    final problem = !_validNumber
        ? s.t(_kind == 'PREPAID' ? 'mobile.live.enterMobile' : 'mobile.live.enterDth')
        : op == null
            ? s.t('mobile.live.chooseOperator')
            : null;
    widget.onChanged(LiveState(
      live: {'providerId': op?.id, if (_kind == 'PREPAID' && _validNumber) 'mobile': _number.text},
      details: {'rechargeType': _kind, 'operator': op == null ? '' : operatorEnum(op.name), 'subscriberNumber': _number.text, 'circle': _circleName ?? ''},
      amountPaise: amountPaise,
      ready: problem == null,
      problem: problem,
    ));
  }

  Future<void> _lookup() async {
    if (_kind != 'PREPAID' || !_validNumber || _lookupFor == _number.text) return;
    _lookupFor = _number.text;
    setState(() => _looking = true);
    try {
      final r = await ref.read(apiProvider).p2aLookup(_number.text);
      if (!mounted) return;
      setState(() {
        final id = intOrNull(r, 'provider_id');
        if (id != null) _providerId = id;
        _circleId = strOrNull(r, 'circle_id');
        _circleName = strOrNull(r, 'circle_name');
        _detected = [strOrNull(r, 'provider_name'), _circleName].whereType<String>().join(' · ');
      });
    } on ApiException catch (_) {
      // Operator can still be chosen by hand.
    } finally {
      if (mounted) setState(() => _looking = false);
      _emit();
    }
  }

  Future<void> _plans(P2AOperator op) async {
    final picked = await showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => FractionallySizedBox(heightFactor: 0.85, child: _PlansSheet(operator: op, circleId: _circleId)),
    );
    if (picked != null) _emit(amountPaise: picked);
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final ops = ref.watch(p2aOperatorsProvider);
    final list = _operators(ops.value ?? const []);
    P2AOperator? op;
    for (final o in list) {
      if (o.id == _providerId) op = o;
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SegmentedButton<String>(
        segments: [
          ButtonSegment(value: 'PREPAID', label: Text(s.t('mobile.live.prepaid'))),
          ButtonSegment(value: 'DTH', label: Text(s.t('mobile.live.dth'))),
        ],
        selected: {_kind},
        onSelectionChanged: (v) {
          setState(() {
            _kind = v.first;
            _providerId = null;
            _detected = null;
            _lookupFor = null;
          });
          _emit();
        },
      ),
      const SizedBox(height: Tokens.s3),
      TextField(
        key: const Key('live.number'),
        controller: _number,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(_kind == 'PREPAID' ? 10 : 16)],
        style: const TextStyle(fontFeatures: moneyFeatures, fontSize: 18),
        onChanged: (_) {
          _emit();
          _lookup();
        },
        decoration: InputDecoration(
          labelText: s.t(_kind == 'PREPAID' ? 'mobile.live.mobileNumber' : 'mobile.live.subscriberId'),
          prefixText: _kind == 'PREPAID' ? '+91 ' : null,
          helperText: _looking ? s.t('mobile.live.finding') : (_detected == null || _detected!.isEmpty ? null : s.t('mobile.live.detected', {'name': _detected!})),
          suffixIcon: _looking ? const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))) : null,
        ),
      ),
      const SizedBox(height: Tokens.s3),
      DropdownButtonFormField<int>(
        key: ValueKey('live.operator.$_kind.$_providerId'),
        initialValue: op?.id,
        isExpanded: true,
        decoration: InputDecoration(labelText: s.t('field.operator'), errorText: ops.hasError ? errorText(context, ops.error!) : null),
        hint: Text(ops.isLoading ? s.t('mobile.live.loadingOperators') : s.t('mobile.live.chooseOperator')),
        items: [for (final o in list) DropdownMenuItem(value: o.id, child: Text(o.name))],
        onChanged: (v) {
          setState(() => _providerId = v);
          _emit();
        },
      ),
      if (op != null) ...[
        const SizedBox(height: Tokens.s2),
        Row(children: [
          OutlinedButton.icon(onPressed: () => _plans(op!), icon: const Icon(Icons.list_alt_rounded), label: Text(s.t('mobile.live.browsePlans'))),
          const Spacer(),
          if (widget.amountPaise > 0) MoneyText(widget.amountPaise, style: const TextStyle(fontWeight: FontWeight.w700)),
        ]),
      ],
    ]);
  }
}

class _PlansSheet extends ConsumerStatefulWidget {
  const _PlansSheet({required this.operator, this.circleId});
  final P2AOperator operator;
  final String? circleId;

  @override
  ConsumerState<_PlansSheet> createState() => _PlansSheetState();
}

class _PlansSheetState extends ConsumerState<_PlansSheet> {
  late final Future<List<P2APlan>> _plans = ref.read(apiProvider).p2aPlans(widget.operator.id, circleId: widget.circleId);
  String _cat = '';
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final t = context.tokens;
    return FutureBuilder<List<P2APlan>>(
      future: _plans,
      builder: (context, snap) {
        if (snap.hasError) return ErrorView(error: snap.error!, onRetry: () => Navigator.pop(context));
        if (!snap.hasData) return const LoadingView();
        final all = snap.data!;
        final cats = {for (final p in all) ?p.category}.toList();
        final list = all.where((p) => (_cat.isEmpty || p.category == _cat) && (_q.isEmpty || '${p.amountPaise ~/ 100} ${p.data} ${p.description} ${p.validity}'.toLowerCase().contains(_q))).toList();
        return Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Tokens.s4, 0, Tokens.s4, Tokens.s2),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(s.t('mobile.live.plansTitle', {'operator': widget.operator.name}), style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: Tokens.s2),
              TextField(
                decoration: InputDecoration(prefixIcon: const Icon(Icons.search_rounded), hintText: s.t('mobile.live.searchPlans'), isDense: true),
                onChanged: (v) => setState(() => _q = v.trim().toLowerCase()),
              ),
              if (cats.isNotEmpty) ...[
                const SizedBox(height: Tokens.s2),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(children: [
                    for (final c in ['', ...cats])
                      Padding(
                        padding: const EdgeInsets.only(right: Tokens.s2),
                        child: ChoiceChip(label: Text(c.isEmpty ? s.t('mobile.live.all') : c), selected: _cat == c, onSelected: (_) => setState(() => _cat = c)),
                      ),
                  ]),
                ),
              ],
            ]),
          ),
          Expanded(
            child: list.isEmpty
                ? EmptyView(message: s.t('mobile.live.noPlans'), icon: Icons.inbox_outlined)
                : ListView.separated(
                    padding: const EdgeInsets.all(Tokens.s4),
                    itemCount: list.length,
                    separatorBuilder: (_, _) => const SizedBox(height: Tokens.s2),
                    itemBuilder: (_, i) {
                      final p = list[i];
                      return AppCard(
                        padding: EdgeInsets.zero,
                        child: ListTile(
                          onTap: p.amountPaise > 0 ? () => Navigator.pop(context, p.amountPaise) : null,
                          leading: Text(formatInr(p.amountPaise, decimals: false), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                          title: Text([p.validity, p.data].whereType<String>().join(' · '), style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: p.description == null ? null : Text(p.description!, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.textMuted)),
                        ),
                      );
                    },
                  ),
          ),
        ]);
      },
    );
  }
}

// ------------------------------------------------------------------------------------ bill payment

class BillLive extends ConsumerStatefulWidget {
  const BillLive({super.key, required this.onChanged});
  final ValueChanged<LiveState> onChanged;

  @override
  ConsumerState<BillLive> createState() => _BillLiveState();
}

class _BillLiveState extends ConsumerState<BillLive> {
  String? _category;
  String? _categoryName;
  String? _billerId;
  String? _billerName;
  final Map<String, TextEditingController> _params = {};
  final _mobile = TextEditingController();
  FetchedBill? _bill;
  bool _fetching = false;
  String? _fetchError;

  @override
  void dispose() {
    for (final c in _params.values) {
      c.dispose();
    }
    _mobile.dispose();
    super.dispose();
  }

  TextEditingController _param(String name) => _params.putIfAbsent(name, TextEditingController.new);

  bool get _validMobile => RegExp(r'^[6-9]\d{9}$').hasMatch(_mobile.text);

  void _emit(List<BillerParam> params) {
    final s = context.s;
    final missing = params.where((p) => !p.optional && _param(p.name).text.trim().isEmpty).toList();
    final problem = _billerId == null
        ? s.t('mobile.live.chooseBiller')
        : missing.isNotEmpty
            ? s.t('mobile.live.enterParam', {'name': missing.first.name})
            : !_validMobile
                ? s.t('mobile.live.enterMobile')
                : _bill == null
                    ? s.t('mobile.live.fetchFirst')
                    : null;
    final values = {for (final p in params) if (_param(p.name).text.trim().isNotEmpty) p.name: _param(p.name).text.trim()};
    final due = isoDateOf(_bill?.dueDate);
    widget.onChanged(LiveState(
      live: {'billerId': _billerId, 'referenceId': _bill?.referenceId, 'params': values, 'mobile': _validMobile ? _mobile.text : null},
      details: {
        'billCategory': billEnum(_categoryName ?? ''),
        'billerName': _billerName ?? '',
        'consumerId': params.isEmpty ? '' : _param(params.first.name).text.trim(),
        'billDueDate': ?due,
      },
      amountPaise: _bill?.amountPaise,
      ready: problem == null,
      problem: problem,
    ));
  }

  Future<void> _fetch(List<BillerParam> params) async {
    setState(() {
      _fetching = true;
      _fetchError = null;
      _bill = null;
    });
    try {
      final b = await ref.read(apiProvider).p2aFetchBill(
            billerId: _billerId!,
            params: {for (final p in params) if (_param(p.name).text.trim().isNotEmpty) p.name: _param(p.name).text.trim()},
            mobile: _mobile.text,
          );
      if (mounted) setState(() => _bill = b);
    } on ApiException catch (e) {
      if (mounted) setState(() => _fetchError = errorText(context, e));
    } finally {
      if (mounted) setState(() => _fetching = false);
      _emit(params);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final t = context.tokens;
    final cats = ref.watch(p2aBillCategoriesProvider);
    final billers = _category == null ? null : ref.watch(p2aBillersProvider(_category!));
    final paramsValue = _billerId == null ? null : ref.watch(p2aBillerParamsProvider(_billerId!));
    final params = paramsValue?.value ?? const <BillerParam>[];
    final err = cats.error ?? billers?.error ?? paramsValue?.error;

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      DropdownButtonFormField<String>(
        initialValue: _category,
        isExpanded: true,
        decoration: InputDecoration(labelText: s.t('field.billCategory')),
        hint: Text(cats.isLoading ? s.t('mobile.live.loading') : s.t('mobile.common.select')),
        items: [for (final (slug, name) in cats.value ?? const <(String, String)>[]) DropdownMenuItem(value: slug, child: Text(name))],
        onChanged: (v) {
          setState(() {
            _category = v;
            _categoryName = (cats.value ?? const []).where((c) => c.$1 == v).firstOrNull?.$2;
            _billerId = null;
            _bill = null;
          });
          _emit(const []);
        },
      ),
      const SizedBox(height: Tokens.s3),
      DropdownButtonFormField<String>(
        key: ValueKey('live.biller.$_category'),
        initialValue: _billerId,
        isExpanded: true,
        decoration: InputDecoration(labelText: s.t('mobile.live.biller')),
        hint: Text(_category == null ? s.t('mobile.live.pickCategory') : (billers?.isLoading ?? false) ? s.t('mobile.live.loading') : s.t('mobile.live.chooseBiller')),
        items: [for (final (id, name) in billers?.value ?? const <(String, String)>[]) DropdownMenuItem(value: id, child: Text(name, overflow: TextOverflow.ellipsis))],
        onChanged: _category == null
            ? null
            : (v) {
                setState(() {
                  _billerId = v;
                  _billerName = (billers?.value ?? const []).where((b) => b.$1 == v).firstOrNull?.$2;
                  _bill = null;
                });
                _emit(const []);
              },
      ),
      for (final p in params) ...[
        const SizedBox(height: Tokens.s3),
        TextField(
          controller: _param(p.name),
          keyboardType: p.numeric ? TextInputType.number : TextInputType.text,
          inputFormatters: [if (p.maxLength != null) LengthLimitingTextInputFormatter(p.maxLength)],
          onChanged: (_) {
            setState(() => _bill = null);
            _emit(params);
          },
          decoration: InputDecoration(labelText: p.optional ? '${p.name} (${s.t('common.optional')})' : p.name),
        ),
      ],
      if (_billerId != null) ...[
        const SizedBox(height: Tokens.s3),
        TextField(
          key: const Key('live.billMobile'),
          controller: _mobile,
          keyboardType: TextInputType.phone,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
          onChanged: (_) => _emit(params),
          decoration: InputDecoration(labelText: s.t('mobile.live.customerMobile'), prefixText: '+91 ', helperText: s.t('mobile.live.customerMobileHelp')),
        ),
        const SizedBox(height: Tokens.s3),
        OutlinedButton.icon(
          key: const Key('live.fetchBill'),
          onPressed: _fetching || !_validMobile || params.any((p) => !p.optional && _param(p.name).text.trim().isEmpty) ? null : () => _fetch(params),
          icon: _fetching ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.receipt_long_rounded),
          label: Text(s.t(_bill == null ? 'mobile.live.fetchBill' : 'mobile.live.fetchAgain')),
        ),
      ],
      if (_fetchError != null || err != null) ...[
        const SizedBox(height: Tokens.s2),
        Text(_fetchError ?? errorText(context, err!), style: TextStyle(color: t.danger)),
      ],
      if (_bill != null) ...[
        const SizedBox(height: Tokens.s3),
        AppCard(
          color: t.success.withValues(alpha: 0.08),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Icon(Icons.check_circle_rounded, color: t.success, size: 20),
              const SizedBox(width: 6),
              Text(s.t('mobile.live.billFound'), style: TextStyle(color: t.success, fontWeight: FontWeight.w700)),
            ]),
            if (_bill!.customerName != null) KeyValueRow(label: s.t('record.customer'), value: _bill!.customerName!),
            KeyValueRow(label: s.t('mobile.live.amountDue'), value: '', valueWidget: MoneyText(_bill!.amountPaise ?? 0, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
            if (_bill!.dueDate != null) KeyValueRow(label: s.t('field.billDueDate'), value: _bill!.dueDate!),
            if (_bill!.billNumber != null) KeyValueRow(label: s.t('mobile.live.billNumber'), value: _bill!.billNumber!),
            if (_bill!.billPeriod != null) KeyValueRow(label: s.t('mobile.live.billPeriod'), value: _bill!.billPeriod!),
          ]),
        ),
      ],
    ]);
  }
}

// ------------------------------------------------------------------------------------ result

/// Shows the result of a Live operation. Returns when the operator closes it.
Future<void> showLiveResult(BuildContext context, WidgetRef ref, ProviderOperation initial) => showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _LiveResultDialog(initial: initial),
    );

class _LiveResultDialog extends ConsumerStatefulWidget {
  const _LiveResultDialog({required this.initial});
  final ProviderOperation initial;

  @override
  ConsumerState<_LiveResultDialog> createState() => _LiveResultDialogState();
}

class _LiveResultDialogState extends ConsumerState<_LiveResultDialog> {
  late ProviderOperation op = widget.initial;
  bool _checking = false;

  Future<void> _check() async {
    setState(() => _checking = true);
    try {
      final next = await ref.read(apiProvider).providerOperation(op.id);
      if (mounted) setState(() => op = next);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, errorText(context, e), error: true);
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final t = context.tokens;
    final ok = op.status == 'CONFIRMED';
    final failed = op.status == 'FAILED';
    final color = ok ? t.success : failed ? t.danger : t.warning;
    final canCheck = ref.watch(tenantContextProvider).value?.can('integrations.view') ?? false;
    return AlertDialog(
      key: const Key('live.result'),
      icon: Icon(ok ? Icons.check_circle_rounded : failed ? Icons.error_rounded : Icons.schedule_rounded, color: color, size: 48),
      title: Text(s.t(ok ? 'mobile.live.success' : failed ? 'mobile.live.failed' : op.status == 'UNKNOWN' ? 'mobile.live.unknown' : 'mobile.live.processing')),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        MoneyText(op.record.principalPaise, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
        if (op.providerRef != null) ...[
          const SizedBox(height: Tokens.s2),
          Text(s.t('mobile.live.ref', {'ref': op.providerRef!}), textAlign: TextAlign.center, style: TextStyle(color: t.textMuted)),
        ],
        if (op.message != null) ...[
          const SizedBox(height: Tokens.s3),
          InfoBanner(text: op.message!, tone: ok ? BannerTone.success : failed ? BannerTone.danger : BannerTone.warning),
        ],
        if (op.mode != 'LIVE') ...[
          const SizedBox(height: Tokens.s2),
          Text(s.t(op.mode == 'UAT' ? 'mobile.live.uatNote' : 'mobile.live.simNote'), textAlign: TextAlign.center, style: TextStyle(color: t.textMuted, fontSize: 12)),
        ],
      ]),
      actions: [
        if (!op.outcomeKnown && canCheck) TextButton(onPressed: _checking ? null : _check, child: Text(s.t('mobile.live.checkStatus'))),
        FilledButton(onPressed: () => Navigator.pop(context), child: Text(s.t('mobile.live.viewRecord', {'no': op.record.recordNo}))),
      ],
    );
  }
}
