import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dates.dart';
import '../../core/money.dart';
import '../../data/api/api_exception.dart';
import '../../data/models/tenant_models.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';
import '../../widgets/sync_banner.dart';
import '../records/service_picker.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(tenantContextProvider);
    ref.invalidate(dashboardProvider);
    await Future.wait([ref.read(tenantContextProvider.future), ref.read(dashboardProvider.future)].map((f) => f.catchError((_) => Object())));
    await ref.read(syncProvider.notifier).trigger();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final ctxValue = ref.watch(tenantContextProvider);
    final auth = ref.watch(authProvider);
    final shopName = ctxValue.value?.tenant.name ?? auth.me?.activeTenant?.name ?? s.t('app.name');
    final unread = ctxValue.value?.unreadNotifications ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(shopName, overflow: TextOverflow.ellipsis),
          if (ctxValue.value != null)
            Text(s.t('role.${ctxValue.value!.role}'), style: TextStyle(fontSize: Tokens.fontXs, color: context.tokens.textMuted)),
        ]),
        actions: [
          IconButton(
            tooltip: '${s.t('nav.notifications')}${unread > 0 ? ' · ${s.t('mobile.home.unread', {'count': unread})}' : ''}',
            onPressed: () => context.push('/notifications'),
            icon: Badge(isLabelVisible: unread > 0, label: Text('$unread'), child: const Icon(Icons.notifications_outlined)),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'home-fab',
        onPressed: () => showServicePicker(context, ref),
        icon: const Icon(Icons.add_rounded),
        label: Text(s.t('nav.newRecord')),
      ),
      body: RefreshIndicator(
        onRefresh: () => _refresh(ref),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(Tokens.s4, 0, Tokens.s4, 96),
          children: [
            const OfflineBanner(),
            const SyncBanner(),
            AsyncView(
              value: ctxValue,
              onRetry: () => ref.invalidate(tenantContextProvider),
              builder: (ctx) => _ContextSection(ctx: ctx),
            ),
            _DashboardSection(),
          ],
        ),
      ),
    );
  }
}

class _ContextSection extends ConsumerWidget {
  const _ContextSection({required this.ctx});
  final TenantContext ctx;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final tz = ctx.tenant.timezone;
    final limit = ctx.monthlyRecordLimit;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (ctx.tenant.isSuspended) ...[
        const SizedBox(height: Tokens.s3),
        InfoBanner(text: '${s.t('error.TENANT_SUSPENDED')} ${ctx.tenant.statusReason ?? ''}'.trim(), tone: BannerTone.danger),
      ],
      for (final sa in ctx.supportAccess) ...[
        const SizedBox(height: Tokens.s3),
        InfoBanner(
          icon: Icons.support_agent_rounded,
          tone: BannerTone.warning,
          text: s.t('mobile.home.supportAccess', {'time': formatDateTime(sa.expiresAt, tz), 'reason': sa.reason}),
        ),
      ],
      for (final a in ctx.announcements) ...[
        const SizedBox(height: Tokens.s3),
        InfoBanner(
          tone: a.severity == 'CRITICAL' ? BannerTone.danger : (a.severity == 'WARNING' ? BannerTone.warning : BannerTone.info),
          text: '${a.title}\n${a.body}',
          icon: Icons.campaign_outlined,
        ),
      ],
      SectionTitle(s.t('mobile.home.quickEntry')),
      if (ctx.quickActions.isEmpty)
        InfoBanner(text: s.t('mobile.home.noServices'), tone: BannerTone.warning)
      else
        ServiceGrid(codes: ctx.quickActions, onTap: (code) => startNewRecord(context, ref, code)),
      const SizedBox(height: Tokens.s2),
      Text(
        [
          s.t('mobile.home.plan', {'name': ctx.planName}),
          limit == null
              ? s.t('mobile.home.usageUnlimited', {'used': ctx.recordsThisPeriod})
              : s.t('mobile.home.usage', {'used': ctx.recordsThisPeriod, 'limit': limit}),
        ].join(' · '),
        style: Theme.of(context).textTheme.bodySmall,
      ),
    ]);
  }
}

class _DashboardSection extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final widgets = ref.watch(tenantContextProvider).value?.dashboardWidgets ?? const [];
    final canFollowUps = ref.watch(tenantContextProvider).value?.can('followups.manage') ?? false;
    return AsyncView(
      value: ref.watch(dashboardProvider),
      onRetry: () => ref.invalidate(dashboardProvider),
      builder: (d) {
        final f = d.financial;
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          SectionTitle(s.t('mobile.home.todayMetrics', {'date': formatDate(d.date)})),
          if (d.scope == 'MY_RECORDS') ...[
            Text(s.t('mobile.home.scopeMine'), style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: Tokens.s2),
          ],
          _MetricGrid(children: [
            _MetricTile(label: s.t('dashboard.todayRecords'), value: '${d.todayRecords.value}', icon: Icons.receipt_long_outlined),
            if (widgets.contains('pendingApplications'))
              _MetricTile(label: s.t('dashboard.pendingApplications'), value: '${d.pendingApplications.value}', icon: Icons.pending_actions_outlined),
            if (f != null) ...[
              _MetricTile(
                label: s.t('dashboard.customerFees'),
                help: s.t('dashboard.customerFeesHelp'),
                value: formatInr(f.customerFees.value),
                icon: Icons.savings_outlined,
                money: true,
              ),
              _MetricTile(label: s.t('dashboard.cashIn'), help: s.t('dashboard.cashHelp'), value: formatInr(f.cashIn.value), icon: Icons.south_west_rounded, money: true),
              _MetricTile(label: s.t('dashboard.cashOut'), help: s.t('dashboard.cashHelp'), value: formatInr(f.cashOut.value), icon: Icons.north_east_rounded, money: true),
              _MetricTile(
                label: s.t('mobile.home.cashInHand'),
                help: s.t('mobile.home.cashInHandHelp'),
                value: formatInr(f.cashInHand.value),
                icon: Icons.account_balance_wallet_outlined,
                money: true,
              ),
              _MetricTile(
                label: s.t('dashboard.outstandingDues'),
                help: s.t('dashboard.outstandingDuesHelp'),
                value: formatInr(f.outstandingDues.value),
                icon: Icons.request_quote_outlined,
                money: true,
                onTap: () => context.push('/dues'),
              ),
              _MetricTile(
                label: s.t('dashboard.pendingCommission'),
                help: s.t('mobile.home.pendingCommissionHelp'),
                value: formatInr(f.pendingCommission.value),
                icon: Icons.hourglass_bottom_rounded,
                money: true,
              ),
            ],
          ]),
          if (f == null) ...[
            const SizedBox(height: Tokens.s2),
            Text(s.t('mobile.home.financialHidden'), style: Theme.of(context).textTheme.bodySmall),
          ],
          if (widgets.contains('volume')) ...[
            SectionTitle(s.t('dashboard.serviceVolume')),
            AppCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                InfoBanner(text: s.t('dashboard.serviceVolumeHelp'), tone: BannerTone.warning),
                const SizedBox(height: Tokens.s2),
                if (d.volume.isEmpty) Text(s.t('mobile.home.noVolume'), style: TextStyle(color: context.tokens.textMuted)),
                for (final v in d.volume)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(children: [
                      ServiceAvatar(serviceCode: v.serviceCode, size: 32),
                      const SizedBox(width: Tokens.s3),
                      Expanded(child: Text(s.t('service.${v.serviceCode}.name'))),
                      Text(
                        s.t('mobile.home.volumeItem', {'count': v.count, 'amount': formatInr(v.principalPaise)}),
                        style: const TextStyle(fontFeatures: moneyFeatures, fontWeight: FontWeight.w600),
                      ),
                    ]),
                  ),
              ]),
            ),
          ],
          if (!d.checklist.complete) ...[
            SectionTitle(s.t('dashboard.checklist.title')),
            AppCard(
              padding: const EdgeInsets.symmetric(vertical: Tokens.s1),
              child: Column(children: [
                _CheckItem(done: d.checklist.firstCustomer, label: s.t('dashboard.checklist.customer'), onTap: () => context.go('/customers')),
                _CheckItem(done: d.checklist.firstRecord, label: s.t('dashboard.checklist.record'), onTap: () => showServicePicker(context, ref)),
                _CheckItem(done: d.checklist.openingCash, label: s.t('dashboard.checklist.opening'), onTap: () => context.push('/cash')),
                if (d.checklist.staffInvited != null) _CheckItem(done: d.checklist.staffInvited!, label: s.t('dashboard.checklist.staff')),
              ]),
            ),
          ],
          SectionTitle(
            s.t('dashboard.followUpsDue'),
            trailing: TextButton(onPressed: () => context.push('/follow-ups'), child: Text(s.t('mobile.common.viewAll'))),
          ),
          if (d.followUpsDue.isEmpty)
            Text(s.t('mobile.home.noFollowUps'), style: TextStyle(color: context.tokens.textMuted))
          else
            AppCard(
              padding: EdgeInsets.zero,
              child: Column(children: [
                for (final fu in d.followUpsDue)
                  ListTile(
                    leading: Icon(Icons.event_note_rounded, color: context.tokens.warning),
                    title: Text(fu.title),
                    subtitle: Text([
                      s.t('mobile.followups.dueOn', {'date': formatDate(fu.dueDate)}),
                      if (fu.customerName != null) fu.customerName!,
                    ].join(' · ')),
                    trailing: canFollowUps
                        ? IconButton(
                            tooltip: s.t('mobile.followups.markDone'),
                            icon: const Icon(Icons.check_circle_outline_rounded),
                            onPressed: () async {
                              try {
                                await ref.read(apiProvider).completeFollowUp(fu.id, fu.version);
                                ref.invalidate(dashboardProvider);
                                if (context.mounted) showSnack(context, s.t('mobile.followups.done'));
                              } on ApiException catch (e) {
                                if (context.mounted) showSnack(context, errorText(context, e), error: true);
                              }
                            },
                          )
                        : null,
                    onTap: fu.recordId == null ? null : () => context.push('/records/${fu.recordId}'),
                  ),
              ]),
            ),
          SectionTitle(
            s.t('dashboard.recentActivity'),
            trailing: TextButton(onPressed: () => context.go('/records'), child: Text(s.t('mobile.common.viewAll'))),
          ),
          if (d.recent.isEmpty)
            Text(s.t('mobile.home.noRecent'), style: TextStyle(color: context.tokens.textMuted))
          else
            AppCard(
              padding: EdgeInsets.zero,
              child: Column(children: [
                for (final r in d.recent)
                  ListTile(
                    leading: ServiceAvatar(serviceCode: r.serviceCode, size: 40),
                    title: Text('#${r.recordNo} · ${s.t('service.${r.serviceCode}.name')}', overflow: TextOverflow.ellipsis),
                    subtitle: Text([formatDate(r.txnDate), if ((r.customerName ?? '').isNotEmpty) r.customerName!].join(' · ')),
                    trailing: opStatusChip(s, r.opStatus, dense: true),
                    onTap: () => context.push('/records/${r.id}'),
                  ),
              ]),
            ),
        ]);
      },
    );
  }
}

class _MetricGrid extends StatelessWidget {
  const _MetricGrid({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, c) {
        final cols = c.maxWidth > 560 ? 3 : 2;
        final w = (c.maxWidth - Tokens.s2 * (cols - 1)) / cols;
        return Wrap(spacing: Tokens.s2, runSpacing: Tokens.s2, children: [for (final ch in children) SizedBox(width: w, child: ch)]);
      });
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({required this.label, required this.value, required this.icon, this.help, this.money = false, this.onTap});
  final String label;
  final String value;
  final IconData icon;
  final String? help;
  final bool money;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        label: '$label: $value${help != null ? '. $help' : ''}',
        excludeSemantics: true,
        child: AppCard(
          onTap: onTap,
          padding: const EdgeInsets.all(Tokens.s3),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: Text(label, style: TextStyle(color: context.tokens.textMuted, fontSize: 13, height: 1.25))),
              Icon(icon, size: 18, color: context.tokens.textMuted),
            ]),
            const SizedBox(height: Tokens.s2),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(value,
                  style: TextStyle(fontSize: Tokens.fontXl, fontWeight: FontWeight.w700, fontFeatures: money ? moneyFeatures : null)),
            ),
            if (help != null) ...[
              const SizedBox(height: 4),
              Text(help!, style: Theme.of(context).textTheme.bodySmall?.copyWith(fontSize: 11.5, height: 1.25)),
            ],
          ]),
        ),
      );
}

class _CheckItem extends StatelessWidget {
  const _CheckItem({required this.done, required this.label, this.onTap});
  final bool done;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => ListTile(
        leading: Icon(done ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
            color: done ? context.tokens.success : context.tokens.textMuted),
        title: Text(label, style: TextStyle(decoration: done ? TextDecoration.lineThrough : null)),
        trailing: done || onTap == null ? null : const Icon(Icons.chevron_right_rounded),
        onTap: done ? null : onTap,
      );
}
