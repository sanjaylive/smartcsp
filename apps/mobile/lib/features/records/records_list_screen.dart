import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dates.dart';
import '../../core/money.dart';
import '../../core/status.dart';
import '../../data/models/record_models.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';
import '../../widgets/sync_banner.dart';
import 'service_picker.dart';

class RecordsListScreen extends ConsumerStatefulWidget {
  const RecordsListScreen({super.key, this.initialService});
  final String? initialService;

  @override
  ConsumerState<RecordsListScreen> createState() => _RecordsListScreenState();
}

class _RecordsListScreenState extends ConsumerState<RecordsListScreen> {
  late RecordFilters _filters = RecordFilters(service: widget.initialService);
  final _search = TextEditingController();
  final _scroll = ScrollController();
  final List<ServiceRecord> _items = [];
  int _page = 0;
  int _pages = 1;
  int _total = 0;
  bool _loading = false;
  Object? _error;
  Timer? _debounce;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 300) _loadMore();
    });
    _reload();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    _generation++;
    setState(() {
      _items.clear();
      _page = 0;
      _pages = 1;
      _error = null;
      _loading = false;
    });
    await _loadMore();
  }

  Future<void> _loadMore() async {
    if (_loading || _page >= _pages) return;
    final gen = _generation;
    setState(() => _loading = true);
    try {
      final res = await ref.read(apiProvider).records(_filters, page: _page + 1);
      if (!mounted || gen != _generation) return;
      setState(() {
        _items.addAll(res.items);
        _page = res.page;
        _pages = res.pages;
        _total = res.total;
      });
    } catch (e) {
      if (mounted && gen == _generation) setState(() => _error = e);
    } finally {
      if (mounted && gen == _generation) setState(() => _loading = false);
    }
  }

  void _setFilters(RecordFilters f) {
    if (f == _filters) return;
    _filters = f;
    _reload();
  }

  Future<void> _openFilters() async {
    final ctx = ref.read(tenantContextProvider).value;
    final result = await showModalBottomSheet<RecordFilters>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _FilterSheet(initial: _filters, serviceCodes: ctx?.visibleServiceCodes ?? const []),
    );
    if (result != null) _setFilters(result.copyWith(q: () => _filters.q));
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    return Scaffold(
      appBar: AppBar(
        title: Text(s.t('nav.records')),
        actions: [
          IconButton(
            tooltip: s.t('mobile.common.filters'),
            onPressed: _openFilters,
            icon: Badge(isLabelVisible: _filters.activeCount > 0, label: Text('${_filters.activeCount}'), child: const Icon(Icons.tune_rounded)),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        heroTag: 'records-fab',
        tooltip: s.t('nav.newRecord'),
        onPressed: () => showServicePicker(context, ref),
        child: const Icon(Icons.add_rounded),
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Tokens.s4, 0, Tokens.s4, Tokens.s2),
          child: TextField(
            controller: _search,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: s.t('mobile.record.searchHint'),
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: _search.text.isEmpty
                  ? null
                  : IconButton(
                      tooltip: s.t('mobile.common.clear'),
                      icon: const Icon(Icons.clear_rounded),
                      onPressed: () {
                        _search.clear();
                        _setFilters(_filters.copyWith(q: () => null));
                      },
                    ),
            ),
            onChanged: (v) {
              setState(() {});
              _debounce?.cancel();
              _debounce = Timer(const Duration(milliseconds: 400), () => _setFilters(_filters.copyWith(q: () => v.trim().isEmpty ? null : v.trim())));
            },
          ),
        ),
        if (_filters.activeCount > 0) _activeFilterChips(s),
        Padding(padding: const EdgeInsets.symmetric(horizontal: Tokens.s4), child: Column(children: const [OfflineBanner(), SyncBanner()])),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _reload,
            child: _buildList(s),
          ),
        ),
      ]),
    );
  }

  Widget _activeFilterChips(AppStrings s) {
    final chips = <Widget>[];
    void chip(String label, RecordFilters next) => chips.add(Padding(
          padding: const EdgeInsets.only(right: Tokens.s2),
          child: InputChip(label: Text(label), onDeleted: () => _setFilters(next), deleteButtonTooltipMessage: s.t('mobile.common.clear')),
        ));
    if (_filters.service != null) chip(s.t('service.${_filters.service}.name'), _filters.copyWith(service: () => null));
    if (_filters.status != null) chip(s.t('status.${_filters.status}'), _filters.copyWith(status: () => null));
    if (_filters.paymentStatus != null) chip(s.t('payment.${_filters.paymentStatus}'), _filters.copyWith(paymentStatus: () => null));
    if (_filters.from != null) chip('${s.t('mobile.common.from')} ${formatDate(_filters.from)}', _filters.copyWith(from: () => null));
    if (_filters.to != null) chip('${s.t('mobile.common.to')} ${formatDate(_filters.to)}', _filters.copyWith(to: () => null));
    return SizedBox(
      height: 48,
      child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: Tokens.s4), children: chips),
    );
  }

  Widget _buildList(AppStrings s) {
    if (_items.isEmpty && _loading) return ListView(children: const [LoadingView()]);
    if (_items.isEmpty && _error != null) return ListView(children: [ErrorView(error: _error!, onRetry: _reload)]);
    if (_items.isEmpty) return ListView(children: [EmptyView(message: s.t('mobile.record.empty'), icon: Icons.search_off_rounded)]);
    return ListView.separated(
      controller: _scroll,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(Tokens.s4, Tokens.s2, Tokens.s4, 96),
      itemCount: _items.length + 1,
      separatorBuilder: (_, _) => const SizedBox(height: Tokens.s2),
      itemBuilder: (_, i) {
        if (i == _items.length) {
          if (_loading) return const LoadingView();
          if (_error != null) return ErrorView(error: _error!, onRetry: _loadMore);
          return Padding(
            padding: const EdgeInsets.all(Tokens.s3),
            child: Text('${s.t('common.page', {'page': _page, 'pages': _pages})} · $_total', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
          );
        }
        return RecordTile(record: _items[i], onTap: () => context.push('/records/${_items[i].id}'));
      },
    );
  }
}

class RecordTile extends ConsumerWidget {
  const RecordTile({super.key, required this.record, this.onTap});
  final ServiceRecord record;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final r = record;
    String? customName;
    for (final c in ref.watch(tenantContextProvider).value?.customServices ?? const []) {
      if (c.id == r.customServiceId) customName = c.name;
    }
    final amount = r.principalPaise > 0 ? r.principalPaise : r.customerFeePaise;
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(Tokens.s3),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        ServiceAvatar(serviceCode: r.serviceCode, size: 40),
        const SizedBox(width: Tokens.s3),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('#${r.recordNo} · ${serviceLabel(s, r.serviceCode, customName: customName)}',
                style: Theme.of(context).textTheme.titleSmall, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 2),
            Text(
              [formatDate(r.txnDate), r.customerLabel.isEmpty ? s.t('mobile.record.walkIn') : r.customerLabel].join(' · '),
              style: TextStyle(color: context.tokens.textMuted, fontSize: Tokens.fontSm),
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: Tokens.s2),
            Wrap(spacing: Tokens.s1, runSpacing: Tokens.s1, children: [
              opStatusChip(s, r.opStatus, dense: true),
              if (r.paymentStatus != 'NOT_APPLICABLE') paymentChip(s, r.paymentStatus, dense: true),
            ]),
          ]),
        ),
        const SizedBox(width: Tokens.s2),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          MoneyText(amount, style: const TextStyle(fontWeight: FontWeight.w700)),
          if (r.amountDuePaise > 0)
            Text('${s.t('record.amountDue')} ${formatInr(r.amountDuePaise)}',
                style: TextStyle(color: context.tokens.warning, fontSize: Tokens.fontXs, fontFeatures: moneyFeatures)),
        ]),
      ]),
    );
  }
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({required this.initial, required this.serviceCodes});
  final RecordFilters initial;
  final List<String> serviceCodes;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late RecordFilters f = widget.initial;

  Future<void> _date(bool from) async {
    final current = parseIsoDate(from ? f.from : f.to) ?? DateTime.now();
    final d = await showDatePicker(context: context, initialDate: current, firstDate: DateTime(2000), lastDate: DateTime(2100));
    if (d == null) return;
    setState(() => f = from ? f.copyWith(from: () => toIsoDate(d)) : f.copyWith(to: () => toIsoDate(d)));
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final statuses = {...transactionStatuses, ...applicationStatuses}.toList();
    Widget choiceRow(String title, List<String> values, String? selected, String Function(String) label, ValueChanged<String?> onSel) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(padding: const EdgeInsets.only(top: Tokens.s3, bottom: Tokens.s2), child: Text(title, style: Theme.of(context).textTheme.titleSmall)),
            Wrap(spacing: Tokens.s2, runSpacing: Tokens.s2, children: [
              for (final v in values)
                ChoiceChip(label: Text(label(v)), selected: selected == v, onSelected: (on) => onSel(on ? v : null)),
            ]),
          ],
        );
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(Tokens.s4, 0, Tokens.s4, MediaQuery.viewInsetsOf(context).bottom + Tokens.s4),
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(s.t('mobile.common.filters'), style: Theme.of(context).textTheme.titleMedium),
            if (widget.serviceCodes.isNotEmpty)
              choiceRow(s.t('nav.services'), widget.serviceCodes, f.service, (c) => s.t('service.$c.name'), (v) => setState(() => f = f.copyWith(service: () => v))),
            choiceRow(s.t('common.status'), statuses, f.status, (c) => s.t('status.$c'), (v) => setState(() => f = f.copyWith(status: () => v))),
            choiceRow(s.t('mobile.record.paymentStatus'), paymentStatuses, f.paymentStatus, (c) => s.t('payment.$c'),
                (v) => setState(() => f = f.copyWith(paymentStatus: () => v))),
            const SizedBox(height: Tokens.s3),
            Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _date(true),
                  icon: const Icon(Icons.event_rounded),
                  label: Text(f.from == null ? s.t('mobile.common.from') : formatDate(f.from)),
                ),
              ),
              const SizedBox(width: Tokens.s2),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _date(false),
                  icon: const Icon(Icons.event_rounded),
                  label: Text(f.to == null ? s.t('mobile.common.to') : formatDate(f.to)),
                ),
              ),
            ]),
            const SizedBox(height: Tokens.s4),
            Row(children: [
              Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(context, RecordFilters(q: f.q)), child: Text(s.t('mobile.common.clear')))),
              const SizedBox(width: Tokens.s2),
              Expanded(child: FilledButton(onPressed: () => Navigator.pop(context, f), child: Text(s.t('mobile.common.apply')))),
            ]),
          ]),
        ),
      ),
    );
  }
}
