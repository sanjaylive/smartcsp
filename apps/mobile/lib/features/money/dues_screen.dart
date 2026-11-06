import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dates.dart';
import '../../core/money.dart';
import '../../data/api/api_client.dart';
import '../../data/api/api_exception.dart';
import '../../data/models/money_models.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

class DuesScreen extends ConsumerWidget {
  const DuesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final canCollect = ref.watch(tenantContextProvider).value?.can('dues.collect') ?? false;
    return Scaffold(
      appBar: AppBar(title: Text(s.t('dues.title'))),
      body: AsyncView(
        value: ref.watch(duesProvider),
        onRetry: () => ref.invalidate(duesProvider),
        builder: (dues) => RefreshIndicator(
          onRefresh: () => ref.refresh(duesProvider.future),
          child: ListView(
            padding: const EdgeInsets.all(Tokens.s4),
            children: [
              AppCard(
                child: Row(children: [
                  Expanded(child: Text(s.t('mobile.dues.total'), style: TextStyle(color: context.tokens.textMuted))),
                  MoneyText(dues.totalDuePaise, style: const TextStyle(fontSize: Tokens.fontXl, fontWeight: FontWeight.w700)),
                ]),
              ),
              const SizedBox(height: Tokens.s3),
              if (dues.items.isEmpty) EmptyView(message: s.t('mobile.dues.empty'), icon: Icons.celebration_outlined),
              for (final g in dues.items) ...[
                AppCard(
                  padding: EdgeInsets.zero,
                  child: ExpansionTile(
                    shape: const Border(),
                    collapsedShape: const Border(),
                    leading: const Icon(Icons.person_rounded),
                    title: Text(g.customerName, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text('${g.records.length} · ${s.t('nav.records')}'),
                    trailing: MoneyText(g.totalDuePaise, color: context.tokens.warning, style: const TextStyle(fontWeight: FontWeight.w700)),
                    children: [
                      for (final r in g.records)
                        ListTile(
                          dense: true,
                          title: Text('#${r.recordNo} · ${s.t('service.${r.serviceCode}.name')}'),
                          subtitle: Text(formatDate(r.txnDate)),
                          trailing: MoneyText(r.amountDuePaise),
                          onTap: () => context.push('/records/${r.id}'),
                        ),
                      if (canCollect)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(Tokens.s4, 0, Tokens.s4, Tokens.s3),
                          child: SizedBox(
                            width: double.infinity,
                            child: FilledButton.icon(
                              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CollectScreen(group: g))),
                              icon: const Icon(Icons.payments_outlined),
                              label: Text(s.t('dues.collect')),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: Tokens.s2),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Records a (partial) collection allocated to one customer's due records.
class CollectScreen extends ConsumerStatefulWidget {
  const CollectScreen({super.key, required this.group});
  final DueGroup group;

  @override
  ConsumerState<CollectScreen> createState() => _CollectScreenState();
}

class _CollectScreenState extends ConsumerState<CollectScreen> {
  late final Map<String, TextEditingController> _amounts = {
    for (final r in widget.group.records) r.id: TextEditingController(text: paiseToInput(r.amountDuePaise)),
  };
  String _method = 'CASH';
  late String _receivedOn = todayIso(ref.read(shopTimezoneProvider));
  Map<String, String> _errors = {};
  String? _formError;
  bool _busy = false;
  String? _idemKey;
  String? _lastBody;

  @override
  void dispose() {
    for (final c in _amounts.values) {
      c.dispose();
    }
    super.dispose();
  }

  Map<String, int> get _parsed => {
        for (final e in _amounts.entries) e.key: e.value.text.trim().isEmpty ? 0 : (parseRupeesToPaise(e.value.text) ?? -1),
      };

  int get _total => sumPaise(_parsed.values.where((v) => v > 0));

  Future<void> _submit() async {
    final s = context.s;
    final errors = <String, String>{};
    final parsed = _parsed;
    for (final r in widget.group.records) {
      final v = parsed[r.id]!;
      if (v < 0) {
        errors[r.id] = s.t('validation.amount');
      } else if (v > r.amountDuePaise) {
        errors[r.id] = s.t('mobile.dues.exceeds');
      }
    }
    if (errors.isEmpty && _total == 0) _formError = s.t('mobile.dues.nothing');
    setState(() => _errors = errors);
    if (errors.isNotEmpty || _total == 0) {
      setState(() {});
      return;
    }
    final allocations = {for (final e in parsed.entries) if (e.value > 0) e.key: e.value};
    final bodyKey = '$_method|$_receivedOn|$allocations';
    if (bodyKey != _lastBody) {
      _idemKey = newIdempotencyKey();
      _lastBody = bodyKey;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(s.t('dues.collect')),
        content: Text('${widget.group.customerName}\n${s.t('mobile.dues.totalAllocated', {'amount': formatInr(_total)})} · ${s.t('method.$_method')}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: Text(s.t('common.cancel'))),
          FilledButton(onPressed: () => Navigator.pop(d, true), child: Text(s.t('common.confirm'))),
        ],
      ),
    );
    if (ok != true) return;
    setState(() {
      _busy = true;
      _formError = null;
    });
    try {
      final res = await ref.read(apiProvider).collect(
            customerId: widget.group.customerId,
            method: _method,
            receivedOn: _receivedOn,
            allocations: allocations,
            idempotencyKey: _idemKey!,
          );
      ref.invalidate(duesProvider);
      ref.invalidate(dashboardProvider);
      if (!mounted) return;
      showSnack(context, s.t('mobile.dues.saved', {'no': res.receiptNo}));
      Navigator.pop(context);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _formError = errorText(context, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    return Scaffold(
      appBar: AppBar(title: Text(s.t('dues.collect'))),
      body: ListView(
        padding: const EdgeInsets.all(Tokens.s4),
        children: [
          Text(widget.group.customerName, style: Theme.of(context).textTheme.titleMedium),
          if (_formError != null) ...[const SizedBox(height: Tokens.s2), InfoBanner(text: _formError!, tone: BannerTone.danger)],
          SectionTitle(s.t('dues.allocate')),
          for (final r in widget.group.records) ...[
            TextField(
              controller: _amounts[r.id],
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
              style: const TextStyle(fontFeatures: moneyFeatures),
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: s.t('mobile.dues.recordDue', {'no': r.recordNo, 'service': s.t('service.${r.serviceCode}.name'), 'amount': formatInr(r.amountDuePaise)}),
                prefixText: '₹ ',
                errorText: _errors[r.id],
              ),
            ),
            const SizedBox(height: Tokens.s3),
          ],
          DropdownButtonFormField<String>(
            initialValue: _method,
            decoration: InputDecoration(labelText: s.t('mobile.dues.method')),
            items: [for (final m in const ['CASH', 'UPI', 'BANK']) DropdownMenuItem(value: m, child: Text(s.t('method.$m')))],
            onChanged: (v) => setState(() => _method = v ?? _method),
          ),
          const SizedBox(height: Tokens.s3),
          InkWell(
            onTap: () async {
              final d = await showDatePicker(context: context, initialDate: parseIsoDate(_receivedOn) ?? DateTime.now(), firstDate: DateTime(2000), lastDate: DateTime.now());
              if (d != null) setState(() => _receivedOn = toIsoDate(d));
            },
            child: InputDecorator(
              decoration: InputDecoration(labelText: s.t('mobile.dues.receivedOn'), suffixIcon: const Icon(Icons.calendar_today_rounded)),
              child: Text(formatDate(_receivedOn)),
            ),
          ),
          const SizedBox(height: Tokens.s4),
          AppCard(
            color: context.tokens.surfaceMuted,
            child: KeyValueRow(label: s.t('mobile.dues.totalAllocated', {'amount': ''}).replaceAll(':', '').trim(), value: '', valueWidget: MoneyText(_total, style: const TextStyle(fontWeight: FontWeight.w700))),
          ),
          const SizedBox(height: Tokens.s4),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : Text(s.t('dues.collect')),
          ),
        ],
      ),
    );
  }
}
