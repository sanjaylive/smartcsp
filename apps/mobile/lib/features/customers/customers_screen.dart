import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/registry/field_validation.dart';
import '../../data/api/api_exception.dart';
import '../../data/models/money_models.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';
import '../records/record_form_screen.dart';

/// Customer search with quick add. In [pickMode] tapping a customer returns a [CustomerChoice].
class CustomersScreen extends ConsumerStatefulWidget {
  const CustomersScreen({super.key, this.pickMode = false});
  final bool pickMode;

  @override
  ConsumerState<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends ConsumerState<CustomersScreen> {
  final _search = TextEditingController();
  final List<Customer> _items = [];
  Timer? _debounce;
  bool _loading = false;
  Object? _error;
  int _page = 0;
  int _pages = 1;
  int _gen = 0;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    _gen++;
    setState(() {
      _items.clear();
      _page = 0;
      _pages = 1;
      _error = null;
      _loading = false;
    });
    await _more();
  }

  Future<void> _more() async {
    if (_loading || _page >= _pages) return;
    final gen = _gen;
    setState(() => _loading = true);
    try {
      final q = _search.text.trim();
      final res = await ref.read(apiProvider).customers(q: q.isEmpty ? null : q, page: _page + 1);
      if (!mounted || gen != _gen) return;
      setState(() {
        _items.addAll(res.items);
        _page = res.page;
        _pages = res.pages;
      });
    } catch (e) {
      if (mounted && gen == _gen) setState(() => _error = e);
    } finally {
      if (mounted && gen == _gen) setState(() => _loading = false);
    }
  }

  void _choose(Customer c) {
    if (widget.pickMode) {
      context.pop(CustomerChoice(c.id, c.name));
    } else {
      _showInfo(c);
    }
  }

  void _showInfo(Customer c) {
    final s = context.s;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Tokens.s4, 0, Tokens.s4, Tokens.s4),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(c.name, style: Theme.of(sheet).textTheme.titleLarge),
            const SizedBox(height: Tokens.s2),
            KeyValueRow(label: s.t('customer.phone'), value: c.phone ?? '—'),
            if (c.email != null) KeyValueRow(label: s.t('customer.email'), value: c.email!),
            KeyValueRow(label: s.t('customer.dues'), value: '', valueWidget: MoneyText(c.outstandingDuePaise)),
            if ((c.notes ?? '').isNotEmpty) KeyValueRow(label: s.t('common.notes'), value: c.notes!),
            if (c.phoneMasked) ...[const SizedBox(height: Tokens.s2), InfoBanner(text: s.t('mobile.record.maskedHint'))],
            if (c.outstandingDuePaise > 0) ...[
              const SizedBox(height: Tokens.s3),
              FilledButton.icon(
                onPressed: () {
                  Navigator.pop(sheet);
                  context.push('/dues');
                },
                icon: const Icon(Icons.payments_outlined),
                label: Text(s.t('dues.collect')),
              ),
            ],
          ]),
        ),
      ),
    );
  }

  Future<void> _add() async {
    final created = await showModalBottomSheet<Customer>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _QuickAddSheet(initialName: _search.text.trim()),
    );
    if (created == null || !mounted) return;
    showSnack(context, context.s.t('mobile.customer.added'));
    ref.invalidate(dashboardProvider);
    if (widget.pickMode) {
      context.pop(CustomerChoice(created.id, created.name));
    } else {
      _reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final canManage = ref.watch(tenantContextProvider).value?.can('customers.manage') ?? false;
    return Scaffold(
      appBar: AppBar(title: Text(widget.pickMode ? s.t('mobile.record.selectCustomer') : s.t('customer.title'))),
      floatingActionButton: canManage
          ? FloatingActionButton.extended(
              heroTag: 'customers-fab',
              key: const Key('customers.add'),
              onPressed: _add,
              icon: const Icon(Icons.person_add_alt_1_rounded),
              label: Text(s.t('customer.new')),
            )
          : null,
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Tokens.s4, 0, Tokens.s4, Tokens.s2),
          child: TextField(
            key: const Key('customers.search'),
            controller: _search,
            autofocus: widget.pickMode,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(hintText: s.t('mobile.customer.searchHint'), prefixIcon: const Icon(Icons.search_rounded)),
            onChanged: (_) {
              _debounce?.cancel();
              _debounce = Timer(const Duration(milliseconds: 350), _reload);
            },
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _reload,
            child: NotificationListener<ScrollNotification>(
              onNotification: (n) {
                if (n.metrics.pixels > n.metrics.maxScrollExtent - 200) _more();
                return false;
              },
              child: _list(s, canManage),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _list(AppStrings s, bool canManage) {
    if (_items.isEmpty && _loading) return ListView(children: const [LoadingView()]);
    if (_items.isEmpty && _error != null) return ListView(children: [ErrorView(error: _error!, onRetry: _reload)]);
    if (_items.isEmpty) {
      return ListView(children: [
        EmptyView(
          message: s.t('mobile.customer.noResults'),
          icon: Icons.person_search_rounded,
          action: canManage ? FilledButton.icon(onPressed: _add, icon: const Icon(Icons.person_add_alt_1_rounded), label: Text(s.t('customer.new'))) : null,
        ),
      ]);
    }
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(Tokens.s4, Tokens.s2, Tokens.s4, 96),
      itemCount: _items.length + (_loading ? 1 : 0),
      separatorBuilder: (_, _) => const SizedBox(height: Tokens.s2),
      itemBuilder: (_, i) {
        if (i >= _items.length) return const LoadingView();
        final c = _items[i];
        return AppCard(
          key: Key('customer.${c.id}'),
          onTap: () => _choose(c),
          padding: const EdgeInsets.all(Tokens.s3),
          child: Row(children: [
            CircleAvatar(child: Text(c.name.isEmpty ? '?' : c.name[0].toUpperCase())),
            const SizedBox(width: Tokens.s3),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(c.name, style: Theme.of(context).textTheme.titleSmall),
                Text(c.phone ?? '—', style: TextStyle(color: context.tokens.textMuted, fontFeatures: moneyFeatures)),
              ]),
            ),
            if (c.outstandingDuePaise > 0)
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(s.t('record.amountDue'), style: Theme.of(context).textTheme.bodySmall),
                MoneyText(c.outstandingDuePaise, color: context.tokens.warning, style: const TextStyle(fontWeight: FontWeight.w700)),
              ]),
            if (widget.pickMode) const Icon(Icons.chevron_right_rounded),
          ]),
        );
      },
    );
  }
}

class _QuickAddSheet extends ConsumerStatefulWidget {
  const _QuickAddSheet({required this.initialName});
  final String initialName;

  @override
  ConsumerState<_QuickAddSheet> createState() => _QuickAddSheetState();
}

class _QuickAddSheetState extends ConsumerState<_QuickAddSheet> {
  late final _name = TextEditingController(text: RegExp(r'^\d+$').hasMatch(widget.initialName) ? '' : widget.initialName);
  late final _phone = TextEditingController(text: RegExp(r'^\d{10}$').hasMatch(widget.initialName) ? widget.initialName : '');
  final _notes = TextEditingController();
  Map<String, String> _errors = {};
  String? _formError;
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final s = context.s;
    final e = <String, String>{};
    final n = validateSafeText(_name.text, max: 80, required: true);
    if (n != null) e['name'] = s.issue(n);
    final p = validatePhone(_phone.text);
    if (p != null) e['phone'] = s.issue(p);
    final no = validateSafeText(_notes.text, max: 1000);
    if (no != null) e['notes'] = s.issue(no);
    setState(() {
      _errors = e;
      _formError = null;
    });
    if (e.isNotEmpty) return;
    setState(() => _busy = true);
    try {
      final c = await ref.read(apiProvider).createCustomer(name: _name.text, phone: _phone.text, notes: _notes.text);
      if (mounted) Navigator.pop(context, c);
    } on ApiException catch (err) {
      if (!mounted) return;
      setState(() {
        _errors = {for (final f in err.fields.entries) f.key: f.value.first};
        _formError = errorText(context, err);
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(Tokens.s4, 0, Tokens.s4, MediaQuery.viewInsetsOf(context).bottom + Tokens.s4),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(s.t('customer.new'), style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: Tokens.s3),
          if (_formError != null) ...[InfoBanner(text: _formError!, tone: BannerTone.danger), const SizedBox(height: Tokens.s2)],
          TextField(
            key: const Key('customer.name'),
            controller: _name,
            autofocus: true,
            textCapitalization: TextCapitalization.words,
            maxLength: 80,
            decoration: InputDecoration(labelText: s.t('customer.name'), errorText: _errors['name'], counterText: ''),
          ),
          const SizedBox(height: Tokens.s3),
          TextField(
            key: const Key('customer.phone'),
            controller: _phone,
            keyboardType: TextInputType.phone,
            maxLength: 10,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(
              labelText: '${s.t('customer.phone')} (${s.t('common.optional')})',
              prefixText: '+91 ',
              errorText: _errors['phone'],
              counterText: '',
            ),
          ),
          const SizedBox(height: Tokens.s3),
          TextField(
            controller: _notes,
            maxLines: 2,
            maxLength: 1000,
            decoration: InputDecoration(labelText: '${s.t('common.notes')} (${s.t('common.optional')})', errorText: _errors['notes'], counterText: ''),
          ),
          const SizedBox(height: Tokens.s4),
          FilledButton(
            key: const Key('customer.save'),
            onPressed: _busy ? null : _save,
            child: _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : Text(s.t('common.save')),
          ),
        ]),
      ),
    );
  }
}

