import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/dates.dart';
import '../../core/privacy.dart';
import '../../core/registry/field_validation.dart';
import '../../core/registry/services.dart';
import '../../core/status.dart';
import '../../data/api/api_exception.dart';
import '../../data/models/record_models.dart';
import '../../data/models/tenant_models.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

class RecordDetailScreen extends ConsumerWidget {
  const RecordDetailScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final value = ref.watch(recordDetailProvider(id));
    return Scaffold(
      appBar: AppBar(title: Text(value.value != null ? s.t('record.number', {'no': value.value!.recordNo}) : s.t('nav.records'))),
      body: AsyncView(
        value: value,
        onRetry: () => ref.invalidate(recordDetailProvider(id)),
        builder: (r) => RefreshIndicator(
          onRefresh: () => ref.refresh(recordDetailProvider(id).future),
          child: _RecordDetailBody(record: r),
        ),
      ),
    );
  }
}

class _RecordDetailBody extends ConsumerStatefulWidget {
  const _RecordDetailBody({required this.record});
  final ServiceRecord record;

  @override
  ConsumerState<_RecordDetailBody> createState() => _RecordDetailBodyState();
}

class _RecordDetailBodyState extends ConsumerState<_RecordDetailBody> {
  bool _busy = false;

  ServiceRecord get r => widget.record;

  List<FieldDef> _fields(TenantContext? ctx) {
    if (r.serviceCode != 'CUSTOM') return getService(r.serviceCode)?.fields ?? const [];
    for (final c in ctx?.customServices ?? const <CustomService>[]) {
      if (c.id == r.customServiceId) return c.fields;
    }
    return const [];
  }

  Future<void> _transition(String to) async {
    final s = context.s;
    String? reason;
    bool? reversePosting;
    if (transitionNeedsReason(r.opStatus, to)) {
      reason = await _askReason(s, to);
      if (reason == null) return;
    }
    if (r.postingStatus == 'POSTED' && (to == 'FAILED' || to == 'CANCELLED')) {
      if (!mounted) return;
      reversePosting = await showDialog<bool>(
        context: context,
        builder: (d) => AlertDialog(
          title: Text(s.t('mobile.record.transitionTo', {'status': s.t('status.$to')})),
          content: Text(s.t('mobile.record.reverseQuestion')),
          actions: [
            TextButton(onPressed: () => Navigator.pop(d), child: Text(s.t('common.cancel'))),
            TextButton(onPressed: () => Navigator.pop(d, false), child: Text(s.t('mobile.record.reverseNo'))),
            FilledButton(onPressed: () => Navigator.pop(d, true), child: Text(s.t('mobile.record.reverseYes'))),
          ],
        ),
      );
      if (reversePosting == null) return;
    } else if (reason == null) {
      if (!mounted) return;
      final ok = await showDialog<bool>(
        context: context,
        builder: (d) => AlertDialog(
          title: Text(s.t('mobile.record.transitionTo', {'status': s.t('status.$to')})),
          content: to == 'SUCCESSFUL' ? Text(s.t('record.manualNotice')) : null,
          actions: [
            TextButton(onPressed: () => Navigator.pop(d, false), child: Text(s.t('common.cancel'))),
            FilledButton(onPressed: () => Navigator.pop(d, true), child: Text(s.t('common.confirm'))),
          ],
        ),
      );
      if (ok != true) return;
    }
    await _run(() => ref.read(apiProvider).transition(r.id, version: r.version, to: to, reason: reason, reversePosting: reversePosting), s.t('mobile.record.statusChanged'));
  }

  Future<String?> _askReason(AppStrings s, String to) async {
    final c = TextEditingController();
    String? error;
    final result = await showDialog<String>(
      context: context,
      builder: (d) => StatefulBuilder(
        builder: (d, set) => AlertDialog(
          title: Text(s.t('mobile.record.transitionTo', {'status': s.t('status.$to')})),
          content: TextField(
            controller: c,
            autofocus: true,
            maxLength: 500,
            maxLines: 3,
            decoration: InputDecoration(labelText: s.t('mobile.record.reason'), errorText: error),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(d), child: Text(s.t('common.cancel'))),
            FilledButton(
              onPressed: () {
                final issue = validateSafeText(c.text, max: 500, required: true);
                if (issue != null) return set(() => error = s.issue(issue));
                Navigator.pop(d, c.text.trim());
              },
              child: Text(s.t('common.confirm')),
            ),
          ],
        ),
      ),
    );
    c.dispose();
    return result;
  }

  Future<void> _post() async {
    final s = context.s;
    await _run(() => ref.read(apiProvider).postRecord(r.id, r.version), s.t('mobile.record.posted'));
  }

  Future<void> _run(Future<ServiceRecord> Function() action, String success) async {
    setState(() => _busy = true);
    try {
      await action();
      ref.invalidate(recordDetailProvider(r.id));
      ref.invalidate(dashboardProvider);
      if (mounted) showSnack(context, success);
    } on ApiException catch (e) {
      if (!mounted) return;
      showSnack(context, errorText(context, e), error: true);
      if (e.code == 'VERSION_CONFLICT') ref.invalidate(recordDetailProvider(r.id));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final ctx = ref.watch(tenantContextProvider).value;
    final tz = ctx?.tenant.timezone ?? defaultTimezone;
    final fields = _fields(ctx);
    String? customName;
    for (final c in ctx?.customServices ?? const <CustomService>[]) {
      if (c.id == r.customServiceId) customName = c.name;
    }
    final canTransition = ctx?.can('records.transition') ?? false;
    final canPost = (ctx?.can('records.post') ?? false) && r.postingStatus == 'UNPOSTED' && isPostableStatus(r.workflowType, r.opStatus);
    final anyMasked = r.details.values.any(looksMasked);
    final principalLabel = r.serviceCode == 'CUSTOM' ? 'record.principal.generic' : getService(r.serviceCode)?.principalLabelKey;

    return ListView(
      padding: const EdgeInsets.all(Tokens.s4),
      children: [
        AppCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              ServiceAvatar(serviceCode: r.serviceCode),
              const SizedBox(width: Tokens.s3),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(serviceLabel(s, r.serviceCode, customName: customName), style: Theme.of(context).textTheme.titleMedium),
                  Text(s.t('record.number', {'no': r.recordNo}), style: TextStyle(color: context.tokens.textMuted)),
                ]),
              ),
            ]),
            const SizedBox(height: Tokens.s3),
            Wrap(spacing: Tokens.s2, runSpacing: Tokens.s2, children: [
              opStatusChip(s, r.opStatus),
              if (r.paymentStatus != 'NOT_APPLICABLE') paymentChip(s, r.paymentStatus),
              StatusChip(
                label: s.t('posting.${r.postingStatus}'),
                tone: r.postingStatus == 'POSTED' ? StatusTone.info : StatusTone.neutral,
              ),
            ]),
            const SizedBox(height: Tokens.s3),
            if (r.isManual)
              InfoBanner(
                text: [
                  if (r.opStatus == 'SUCCESSFUL') s.t('record.reportedSuccess'),
                  s.t('record.source.${r.source}'),
                  s.t('record.manualNotice'),
                ].join(' · '),
              ),
          ]),
        ),
        SectionTitle(s.t('common.details')),
        AppCard(
          child: Column(children: [
            KeyValueRow(label: s.t('record.customer'), value: r.customerLabel.isEmpty ? s.t('common.walkIn') : r.customerLabel),
            KeyValueRow(label: r.workflowType == WorkflowType.application ? s.t('record.applicationDate') : s.t('record.txnDate'), value: formatDate(r.txnDate)),
            for (final f in fields)
              if (r.details[f.key] != null && '${r.details[f.key]}'.isNotEmpty)
                KeyValueRow(label: s.label(f.labelKey, literal: f.literalLabel), value: _detailValue(s, f, r.details[f.key])),
            if ((r.externalRef ?? '').isNotEmpty) KeyValueRow(label: s.t('record.externalRef'), value: r.externalRef!),
            if (r.followUpDate != null) KeyValueRow(label: s.t('record.followUpDate'), value: formatDate(r.followUpDate)),
            if ((r.notes ?? '').isNotEmpty) KeyValueRow(label: s.t('common.notes'), value: r.notes!),
            KeyValueRow(label: s.t('mobile.record.createdAt'), value: formatDateTime(r.createdAt, tz)),
          ]),
        ),
        if (anyMasked) ...[
          const SizedBox(height: Tokens.s2),
          InfoBanner(text: s.t('mobile.record.maskedHint'), icon: Icons.visibility_off_outlined),
        ],
        SectionTitle(s.t('mobile.record.amounts')),
        AppCard(
          child: Column(children: [
            if (principalLabel != null && r.principalPaise > 0) _money(s.t(principalLabel), r.principalPaise),
            if (principalLabel != null && r.principalPaise > 0) KeyValueRow(label: s.t('mobile.record.principalMethod'), value: s.t('method.${r.principalMethod}')),
            _money(s.t('record.customerFee'), r.customerFeePaise),
            if (r.expectedCommissionPaise > 0) _money(s.t('record.expectedCommission'), r.expectedCommissionPaise),
            if (r.receivedCommissionPaise > 0) _money(s.t('record.receivedCommission'), r.receivedCommissionPaise),
            const Divider(),
            _money(s.t('mobile.record.receivable'), r.receivablePaise),
            _money(s.t('record.amountCollected'), r.amountCollectedPaise),
            KeyValueRow(label: s.t('record.paymentMethod'), value: s.t('method.${r.paymentMethod}')),
            if (r.amountAllocatedPaise > 0) _money(s.t('dues.collect'), r.amountAllocatedPaise),
            _money(s.t('record.amountDue'), r.amountDuePaise, emphasise: r.amountDuePaise > 0),
          ]),
        ),
        if (r.allocations.isNotEmpty) ...[
          SectionTitle(s.t('dues.title')),
          AppCard(
            padding: EdgeInsets.zero,
            child: Column(children: [
              for (final a in r.allocations)
                ListTile(
                  leading: const Icon(Icons.receipt_rounded),
                  title: MoneyText(a.amountPaise),
                  subtitle: Text('#${a.receiptNo} · ${s.t('method.${a.method}')} · ${formatDate(a.receivedOn)}'),
                  trailing: a.reversed ? StatusChip(label: s.t('mobile.cash.reversed'), tone: StatusTone.danger, dense: true) : null,
                ),
            ]),
          ),
        ],
        SectionTitle(s.t('common.actions')),
        if (canPost)
          Padding(
            padding: const EdgeInsets.only(bottom: Tokens.s2),
            child: FilledButton.icon(
              onPressed: _busy ? null : _post,
              icon: const Icon(Icons.menu_book_rounded),
              label: Text(s.t('record.post')),
            ),
          ),
        if (canPost) Text(s.t('record.postHelp'), style: Theme.of(context).textTheme.bodySmall),
        if (canTransition && r.allowedTransitions.isNotEmpty)
          Wrap(spacing: Tokens.s2, runSpacing: Tokens.s2, children: [
            for (final to in r.allowedTransitions)
              OutlinedButton.icon(
                key: Key('transition.$to'),
                onPressed: _busy ? null : () => _transition(to),
                icon: Icon(_transitionIcon(to)),
                label: Text(s.t('mobile.record.transitionTo', {'status': s.t('status.$to')})),
              ),
          ])
        else
          Text(r.allowedTransitions.isEmpty ? s.t('mobile.record.noTransitions') : s.t('error.PERMISSION_DENIED'),
              style: TextStyle(color: context.tokens.textMuted)),
        SectionTitle(s.t('record.history')),
        AppCard(
          padding: const EdgeInsets.symmetric(vertical: Tokens.s2),
          child: Column(children: [for (final e in r.events) _TimelineRow(event: e, tz: tz)]),
        ),
        const SizedBox(height: Tokens.s8),
      ],
    );
  }

  IconData _transitionIcon(String to) => switch (opStatusTone(to)) {
        StatusTone.success => Icons.check_circle_outline_rounded,
        StatusTone.danger => Icons.cancel_outlined,
        StatusTone.pending => Icons.schedule_rounded,
        _ => Icons.arrow_forward_rounded,
      };

  Widget _money(String label, int paise, {bool emphasise = false}) => KeyValueRow(
        label: label,
        value: '',
        valueWidget: MoneyText(paise,
            style: TextStyle(fontWeight: emphasise ? FontWeight.w700 : FontWeight.w500),
            color: emphasise ? context.tokens.warning : null),
      );

  String _detailValue(AppStrings s, FieldDef f, Object? v) {
    switch (f.type) {
      case FieldType.select:
        for (final o in f.options) {
          if (o.value == v) return s.label(o.labelKey, literal: f.literalLabel);
        }
        return '$v';
      case FieldType.date:
        return formatDate('$v');
      case FieldType.boolean:
        return v == true ? s.t('common.yes') : s.t('common.no');
      case FieldType.checklist:
        if (v is! List) return '';
        return v.map(ChecklistItem.fromJson).map((i) => '${i.done ? '☑' : '☐'} ${i.label}').join('\n');
      default:
        return '$v';
    }
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({required this.event, required this.tz});
  final RecordEvent event;
  final String tz;

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final e = event;
    String title;
    StatusTone tone = StatusTone.neutral;
    if (e.dimension == 'OPERATIONAL' && e.fromStatus == null && e.toStatus != null) {
      title = s.t('event.created', {'status': s.t('status.${e.toStatus}')});
      tone = opStatusTone(e.toStatus!);
    } else if (e.dimension == 'OPERATIONAL') {
      title = '${s.t('status.${e.fromStatus}')} → ${s.t('status.${e.toStatus}')}';
      tone = opStatusTone(e.toStatus ?? '');
    } else if (e.dimension == 'POSTING') {
      title = '${s.t('event.POSTING')}: ${s.t('posting.${e.toStatus}')}';
      tone = StatusTone.info;
    } else {
      title = s.has('event.${e.dimension}') ? s.t('event.${e.dimension}') : e.dimension;
    }
    final color = switch (tone) {
      StatusTone.success => context.tokens.success,
      StatusTone.danger => context.tokens.danger,
      StatusTone.pending => context.tokens.warning,
      StatusTone.info => context.tokens.info,
      StatusTone.neutral => context.tokens.textMuted,
    };
    return ListTile(
      dense: true,
      leading: Icon(Icons.circle, size: 12, color: color),
      minLeadingWidth: 12,
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text([formatDateTime(e.createdAt, tz), if ((e.reason ?? '').isNotEmpty) '${s.t('mobile.record.reason')}: ${e.reason}'].join('\n')),
    );
  }
}
