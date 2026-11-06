import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dates.dart';
import '../../core/status.dart';
import '../../data/api/api_exception.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

class FollowUpsScreen extends ConsumerWidget {
  const FollowUpsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final ctx = ref.watch(tenantContextProvider).value;
    final canManage = ctx?.can('followups.manage') ?? false;
    final today = todayIso(ctx?.tenant.timezone ?? defaultTimezone);
    return Scaffold(
      appBar: AppBar(title: Text(s.t('nav.followUps'))),
      body: AsyncView(
        value: ref.watch(followUpsProvider),
        onRetry: () => ref.invalidate(followUpsProvider),
        builder: (page) => RefreshIndicator(
          onRefresh: () => ref.refresh(followUpsProvider.future),
          child: page.items.isEmpty
              ? ListView(children: [EmptyView(message: s.t('mobile.followups.empty'), icon: Icons.event_available_rounded)])
              : ListView.separated(
                  padding: const EdgeInsets.all(Tokens.s4),
                  itemCount: page.items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: Tokens.s2),
                  itemBuilder: (_, i) {
                    final f = page.items[i];
                    final overdue = f.dueDate.compareTo(today) < 0;
                    return AppCard(
                      onTap: f.recordId == null ? null : () => context.push('/records/${f.recordId}'),
                      padding: const EdgeInsets.all(Tokens.s3),
                      child: Row(children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(f.title, style: Theme.of(context).textTheme.titleSmall),
                            const SizedBox(height: 2),
                            Text([s.t('mobile.followups.dueOn', {'date': formatDate(f.dueDate)}), ?f.customerName].join(' · '),
                                style: TextStyle(color: context.tokens.textMuted)),
                            if ((f.notes ?? '').isNotEmpty) Text(f.notes!, style: Theme.of(context).textTheme.bodySmall),
                            if (overdue) ...[
                              const SizedBox(height: 4),
                              StatusChip(label: s.t('mobile.followups.overdue'), tone: StatusTone.danger, dense: true),
                            ],
                          ]),
                        ),
                        if (canManage)
                          IconButton(
                            tooltip: s.t('mobile.followups.markDone'),
                            icon: const Icon(Icons.check_circle_outline_rounded),
                            onPressed: () async {
                              try {
                                await ref.read(apiProvider).completeFollowUp(f.id, f.version);
                                ref.invalidate(followUpsProvider);
                                ref.invalidate(dashboardProvider);
                                if (context.mounted) showSnack(context, s.t('mobile.followups.done'));
                              } on ApiException catch (e) {
                                if (context.mounted) showSnack(context, errorText(context, e), error: true);
                                ref.invalidate(followUpsProvider);
                              }
                            },
                          ),
                      ]),
                    );
                  },
                ),
        ),
      ),
    );
  }
}
