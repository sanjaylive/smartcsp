import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dates.dart';
import '../../core/status.dart';
import '../../data/local/draft_store.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';
import '../../widgets/sync_banner.dart';

/// Drafts saved on this device. They are clearly separate from server records.
class DraftsScreen extends ConsumerWidget {
  const DraftsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final sync = ref.watch(syncProvider);
    final drafts = sync.drafts;
    return Scaffold(
      appBar: AppBar(
        title: Text(s.t('mobile.drafts.title')),
        actions: [
          IconButton(
            tooltip: s.t('mobile.syncNow'),
            onPressed: sync.running
                ? null
                : () async {
                    final report = await ref.read(syncProvider.notifier).trigger(force: true);
                    if (context.mounted && report != null && report.stoppedOffline) showSnack(context, s.t('mobile.error.offline'), error: true);
                  },
            icon: sync.running ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.sync_rounded),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(Tokens.s4),
        children: [
          InfoBanner(text: s.t('mobile.draftNotConfirmed'), tone: BannerTone.warning, icon: Icons.phone_android_rounded),
          const OfflineBanner(),
          const SizedBox(height: Tokens.s3),
          if (drafts.isEmpty) EmptyView(message: s.t('mobile.drafts.empty'), icon: Icons.cloud_done_outlined),
          for (final d in drafts) ...[_DraftCard(draft: d), const SizedBox(height: Tokens.s2)],
        ],
      ),
    );
  }
}

class _DraftCard extends ConsumerWidget {
  const _DraftCard({required this.draft});
  final LocalDraft draft;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final d = draft;
    final (StatusTone tone, IconData _) = switch (d.state) {
      DraftState.synced => (StatusTone.success, Icons.cloud_done_rounded),
      DraftState.failed => (StatusTone.danger, Icons.sync_problem_rounded),
      DraftState.syncing => (StatusTone.info, Icons.sync_rounded),
      DraftState.pending => (StatusTone.pending, Icons.cloud_upload_outlined),
    };
    final amount = d.data.principalPaise > 0 ? d.data.principalPaise : d.data.customerFeePaise;
    return AppCard(
      onTap: d.state == DraftState.synced && d.serverRecordId != null
          ? () => context.push('/records/${d.serverRecordId}')
          : d.state == DraftState.syncing
              ? null
              : () => context.push('/records/new?draft=${d.localId}&service=${d.data.serviceCode}'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          ServiceAvatar(serviceCode: d.data.serviceCode, size: 40),
          const SizedBox(width: Tokens.s3),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.t('service.${d.data.serviceCode}.name'), style: Theme.of(context).textTheme.titleSmall),
              Text([formatDate(d.data.txnDate), if (d.data.displayName.isNotEmpty) d.data.displayName].join(' · '),
                  style: TextStyle(color: context.tokens.textMuted)),
            ]),
          ),
          MoneyText(amount, style: const TextStyle(fontWeight: FontWeight.w700)),
        ]),
        const SizedBox(height: Tokens.s2),
        Row(children: [
          StatusChip(label: s.t('mobile.drafts.state.${d.state.name.toUpperCase()}'), tone: tone, dense: true),
          const Spacer(),
          if (d.state != DraftState.syncing && d.state != DraftState.synced)
            IconButton(
              tooltip: s.t('mobile.common.delete'),
              icon: const Icon(Icons.delete_outline_rounded),
              onPressed: () async {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (dlg) => AlertDialog(
                    content: Text(s.t('mobile.drafts.deleteConfirm')),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(dlg, false), child: Text(s.t('common.cancel'))),
                      FilledButton(onPressed: () => Navigator.pop(dlg, true), child: Text(s.t('mobile.common.delete'))),
                    ],
                  ),
                );
                if (ok == true) await ref.read(syncProvider.notifier).delete(d.localId);
              },
            ),
        ]),
        if (d.state == DraftState.synced && d.serverRecordNo != null)
          Text(d.duplicate ? s.t('mobile.record.duplicate', {'no': d.serverRecordNo}) : s.t('mobile.drafts.syncedAs', {'no': d.serverRecordNo}),
              style: TextStyle(color: context.tokens.success)),
        if (d.state == DraftState.pending && d.attempts > 0)
          Text(s.t('mobile.drafts.nextRetry', {'count': d.attempts}), style: Theme.of(context).textTheme.bodySmall),
        if (d.state == DraftState.failed) ...[
          const SizedBox(height: Tokens.s1),
          InfoBanner(
            tone: BannerTone.danger,
            text: [
              if (d.lastErrorCode != null && s.has('error.${d.lastErrorCode}')) s.t('error.${d.lastErrorCode}') else ?d.lastErrorMessage,
              for (final e in d.fieldErrors.entries) '${e.key}: ${e.value.join(', ')}',
              s.t('mobile.syncFailed'),
            ].join('\n'),
          ),
        ],
      ]),
    );
  }
}
