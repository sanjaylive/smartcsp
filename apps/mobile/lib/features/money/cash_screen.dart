import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dates.dart';
import '../../core/money.dart';
import '../../core/status.dart';
import '../../data/api/api_client.dart';
import '../../data/api/api_exception.dart';
import '../../data/models/money_models.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

StatusChip dayStatusChip(AppStrings s, String status) => StatusChip(
      label: s.t('mobile.cash.dayStatus.$status'),
      tone: status == 'CLOSED' ? StatusTone.success : (status == 'OPEN' ? StatusTone.neutral : StatusTone.pending),
      dense: true,
    );

class _DateBar extends StatelessWidget {
  const _DateBar({required this.date, required this.today, required this.onChanged});
  final String date;
  final String today;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    return Row(children: [
      IconButton(tooltip: s.t('common.previous'), icon: const Icon(Icons.chevron_left_rounded), onPressed: () => onChanged(addDays(date, -1))),
      Expanded(
        child: TextButton.icon(
          icon: const Icon(Icons.calendar_today_rounded, size: 18),
          label: Text(date == today ? '${s.t('common.today')} · ${formatDate(date)}' : formatDate(date)),
          onPressed: () async {
            final d = await showDatePicker(context: context, initialDate: parseIsoDate(date) ?? DateTime.now(), firstDate: DateTime(2000), lastDate: parseIsoDate(today) ?? DateTime.now());
            if (d != null) onChanged(toIsoDate(d));
          },
        ),
      ),
      IconButton(
        tooltip: s.t('common.next'),
        icon: const Icon(Icons.chevron_right_rounded),
        onPressed: date.compareTo(today) >= 0 ? null : () => onChanged(addDays(date, 1)),
      ),
    ]);
  }
}

/// Cash summary for a business date (cashbook of the Cash in hand account by default).
class CashScreen extends ConsumerStatefulWidget {
  const CashScreen({super.key});

  @override
  ConsumerState<CashScreen> createState() => _CashScreenState();
}

class _CashScreenState extends ConsumerState<CashScreen> {
  String? _date;

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final today = todayIso(ref.watch(shopTimezoneProvider));
    final date = _date ?? today;
    final value = ref.watch(cashbookProvider(date));
    return Scaffold(
      appBar: AppBar(
        title: Text(s.t('mobile.cash.title')),
        actions: [
          TextButton.icon(onPressed: () => context.push('/closing?date=$date'), icon: const Icon(Icons.lock_clock_outlined), label: Text(s.t('nav.closing'))),
        ],
      ),
      body: Column(children: [
        Padding(padding: const EdgeInsets.symmetric(horizontal: Tokens.s2), child: _DateBar(date: date, today: today, onChanged: (d) => setState(() => _date = d))),
        Expanded(
          child: AsyncView(
            value: value,
            onRetry: () => ref.invalidate(cashbookProvider(date)),
            builder: (cb) => RefreshIndicator(
              onRefresh: () => ref.refresh(cashbookProvider(date).future),
              child: ListView(padding: const EdgeInsets.fromLTRB(Tokens.s4, 0, Tokens.s4, Tokens.s8), children: [
                AppCard(
                  child: Column(children: [
                    Row(children: [
                      Expanded(child: Text(s.t('account.${cb.account}'), style: Theme.of(context).textTheme.titleMedium)),
                      dayStatusChip(s, cb.dayStatus),
                    ]),
                    const SizedBox(height: Tokens.s2),
                    KeyValueRow(label: s.t('cashbook.opening'), value: '', valueWidget: MoneyText(cb.openingBalancePaise)),
                    KeyValueRow(label: s.t('cashbook.in'), value: '', valueWidget: MoneyText(cb.totalInPaise, color: context.tokens.success)),
                    KeyValueRow(label: s.t('cashbook.out'), value: '', valueWidget: MoneyText(cb.totalOutPaise, color: context.tokens.danger)),
                    const Divider(),
                    KeyValueRow(label: s.t('cashbook.closing'), value: '', valueWidget: MoneyText(cb.closingBalancePaise, style: const TextStyle(fontWeight: FontWeight.w700))),
                  ]),
                ),
                SectionTitle(s.t('mobile.cash.entries')),
                if (cb.items.isEmpty) Text(s.t('mobile.cash.noEntries'), style: TextStyle(color: context.tokens.textMuted)),
                if (cb.items.isNotEmpty)
                  AppCard(
                    padding: EdgeInsets.zero,
                    child: Column(children: [
                      for (final l in cb.items) _LineTile(line: l),
                    ]),
                  ),
                if (cb.fundBalances.isNotEmpty) ...[
                  SectionTitle(s.t('mobile.cash.fundBalances')),
                  AppCard(
                    child: Column(children: [
                      for (final b in cb.fundBalances)
                        KeyValueRow(label: s.has('account.${b.account}') ? s.t('account.${b.account}') : b.name, value: '', valueWidget: MoneyText(b.balancePaise)),
                    ]),
                  ),
                ],
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}

class _LineTile extends StatelessWidget {
  const _LineTile({required this.line});
  final CashbookLine line;

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final l = line;
    final isIn = l.inPaise > 0;
    return ListTile(
      leading: Icon(isIn ? Icons.south_west_rounded : Icons.north_east_rounded, color: isIn ? context.tokens.success : context.tokens.danger,
          semanticLabel: isIn ? s.t('cashbook.in') : s.t('cashbook.out')),
      title: Text(l.description, maxLines: 2, overflow: TextOverflow.ellipsis),
      subtitle: Text([if (l.memo != null) l.memo!, if (l.reversed) s.t('mobile.cash.reversed')].join(' · ')),
      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
        MoneyText(isIn ? l.inPaise : -l.outPaise, signed: true, color: isIn ? context.tokens.success : context.tokens.danger, style: const TextStyle(fontWeight: FontWeight.w600)),
        Text(formatInr(l.balancePaise), style: Theme.of(context).textTheme.bodySmall?.copyWith(fontFeatures: moneyFeatures)),
      ]),
      onTap: l.sourceType == 'record' && l.sourceId != null ? () => context.push('/records/${l.sourceId}') : null,
    );
  }
}

/// Daily closing: expected cash vs counted cash. Closing requires `day.close`.
class ClosingScreen extends ConsumerStatefulWidget {
  const ClosingScreen({super.key, this.initialDate});
  final String? initialDate;

  @override
  ConsumerState<ClosingScreen> createState() => _ClosingScreenState();
}

class _ClosingScreenState extends ConsumerState<ClosingScreen> {
  late String? _date = widget.initialDate;
  final _counted = TextEditingController();
  final _notes = TextEditingController();
  String? _countedError;
  String? _formError;
  bool _busy = false;
  String? _idemKey;
  String? _lastBody;

  @override
  void dispose() {
    _counted.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _close(ClosingPreview p) async {
    final s = context.s;
    final counted = parseRupeesToPaise(_counted.text);
    if (counted == null) {
      setState(() => _countedError = s.t('validation.amount'));
      return;
    }
    setState(() => _countedError = null);
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(s.t('closing.close')),
        content: Text(s.t('mobile.closing.confirm', {'date': formatDate(p.businessDate), 'amount': formatInr(counted)})),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: Text(s.t('common.cancel'))),
          FilledButton(onPressed: () => Navigator.pop(d, true), child: Text(s.t('closing.close'))),
        ],
      ),
    );
    if (ok != true) return;
    final bodyKey = '${p.businessDate}|$counted|${_notes.text.trim()}';
    if (bodyKey != _lastBody) {
      _idemKey = newIdempotencyKey();
      _lastBody = bodyKey;
    }
    setState(() {
      _busy = true;
      _formError = null;
    });
    try {
      await ref.read(apiProvider).closeDay(businessDate: p.businessDate, countedCashPaise: counted, notes: _notes.text, idempotencyKey: _idemKey!);
      ref.invalidate(closingPreviewProvider(p.businessDate));
      ref.invalidate(cashbookProvider(p.businessDate));
      ref.invalidate(dashboardProvider);
      if (mounted) showSnack(context, s.t('closing.closed'));
    } on ApiException catch (e) {
      if (mounted) setState(() => _formError = errorText(context, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final ctx = ref.watch(tenantContextProvider).value;
    final today = todayIso(ref.watch(shopTimezoneProvider));
    final date = _date ?? today;
    final canClose = ctx?.can('day.close') ?? false;
    return Scaffold(
      appBar: AppBar(title: Text(s.t('closing.title'))),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Tokens.s2),
          child: _DateBar(
            date: date,
            today: today,
            onChanged: (d) => setState(() {
              _date = d;
              _counted.clear();
              _formError = null;
            }),
          ),
        ),
        Expanded(
          child: AsyncView(
            value: ref.watch(closingPreviewProvider(date)),
            onRetry: () => ref.invalidate(closingPreviewProvider(date)),
            builder: (p) {
              final counted = parseRupeesToPaise(_counted.text);
              final variance = counted == null ? null : counted - p.expectedCashPaise;
              return ListView(padding: const EdgeInsets.fromLTRB(Tokens.s4, 0, Tokens.s4, Tokens.s8), children: [
                AppCard(
                  child: Column(children: [
                    Row(children: [
                      Expanded(child: Text(s.t('account.CASH'), style: Theme.of(context).textTheme.titleMedium)),
                      dayStatusChip(s, p.status),
                    ]),
                    const SizedBox(height: Tokens.s2),
                    KeyValueRow(label: s.t('cashbook.opening'), value: '', valueWidget: MoneyText(p.openingCashPaise)),
                    KeyValueRow(label: s.t('dashboard.cashIn'), value: '', valueWidget: MoneyText(p.cashInPaise)),
                    KeyValueRow(label: s.t('dashboard.cashOut'), value: '', valueWidget: MoneyText(p.cashOutPaise)),
                    const Divider(),
                    KeyValueRow(label: s.t('closing.expected'), value: '', valueWidget: MoneyText(p.expectedCashPaise, style: const TextStyle(fontWeight: FontWeight.w700))),
                  ]),
                ),
                SectionTitle(s.t('mobile.closing.summary')),
                AppCard(
                  child: Column(children: [
                    KeyValueRow(label: s.t('mobile.closing.records'), value: '${p.summary.recordsTotal}'),
                    KeyValueRow(label: s.t('mobile.closing.feeIncome'), value: '', valueWidget: MoneyText(p.summary.feeIncomePaise)),
                    KeyValueRow(label: s.t('mobile.closing.commission'), value: '', valueWidget: MoneyText(p.summary.commissionAccruedPaise)),
                    KeyValueRow(label: s.t('mobile.closing.expenses'), value: '', valueWidget: MoneyText(p.summary.expensesPaise)),
                    KeyValueRow(label: s.t('mobile.closing.duesCollected'), value: '', valueWidget: MoneyText(p.summary.duesCollectedPaise)),
                  ]),
                ),
                if (p.summary.recordsUnposted > 0) ...[
                  const SizedBox(height: Tokens.s3),
                  InfoBanner(text: s.t('mobile.closing.unposted', {'count': p.summary.recordsUnposted}), tone: BannerTone.warning),
                ],
                const SizedBox(height: Tokens.s4),
                if (p.isClosed && p.closing != null)
                  AppCard(
                    child: Column(children: [
                      KeyValueRow(label: s.t('closing.counted'), value: '', valueWidget: MoneyText(p.closing!.countedCashPaise)),
                      KeyValueRow(
                        label: s.t('closing.variance'),
                        value: '',
                        valueWidget: MoneyText(p.closing!.variancePaise, signed: true, color: p.closing!.variancePaise == 0 ? null : context.tokens.warning),
                      ),
                      if (p.closing!.closedAt != null)
                        KeyValueRow(label: s.t('closing.closed'), value: formatDateTime(p.closing!.closedAt, ctx?.tenant.timezone ?? defaultTimezone)),
                      if ((p.closing!.notes ?? '').isNotEmpty) KeyValueRow(label: s.t('common.notes'), value: p.closing!.notes!),
                    ]),
                  )
                else if (!canClose)
                  InfoBanner(text: s.t('mobile.closing.noPermission'), icon: Icons.lock_outline_rounded)
                else ...[
                  if (_formError != null) ...[InfoBanner(text: _formError!, tone: BannerTone.danger), const SizedBox(height: Tokens.s3)],
                  TextField(
                    key: const Key('closing.counted'),
                    controller: _counted,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                    style: const TextStyle(fontFeatures: moneyFeatures, fontSize: Tokens.fontLg),
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      labelText: s.t('closing.counted'),
                      helperText: s.t('mobile.closing.countedHelp'),
                      prefixText: '₹ ',
                      errorText: _countedError,
                    ),
                  ),
                  if (variance != null) ...[
                    const SizedBox(height: Tokens.s2),
                    KeyValueRow(
                      label: variance == 0 ? s.t('closing.variance') : (variance > 0 ? s.t('mobile.closing.over') : s.t('mobile.closing.short')),
                      value: '',
                      valueWidget: MoneyText(variance, signed: true, color: variance == 0 ? context.tokens.success : context.tokens.warning),
                    ),
                  ],
                  const SizedBox(height: Tokens.s3),
                  TextField(
                    controller: _notes,
                    maxLength: 500,
                    maxLines: 2,
                    decoration: InputDecoration(labelText: '${s.t('common.notes')} (${s.t('common.optional')})', counterText: ''),
                  ),
                  const SizedBox(height: Tokens.s3),
                  FilledButton.icon(
                    onPressed: _busy || _counted.text.trim().isEmpty ? null : () => _close(p),
                    icon: const Icon(Icons.lock_rounded),
                    label: Text(s.t('closing.close')),
                  ),
                ],
              ]);
            },
          ),
        ),
      ]),
    );
  }
}
