import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/env.dart';
import '../../core/dates.dart';
import '../../core/status.dart';
import '../../data/api/api_exception.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/brand.dart';
import '../../widgets/common.dart';
import '../../widgets/sync_banner.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final ctx = ref.watch(tenantContextProvider).value;
    final sync = ref.watch(syncProvider);
    bool can(String p) => ctx?.can(p) ?? false;
    final items = <(IconData, String, String, String?)>[
      (Icons.phone_android_rounded, s.t('mobile.drafts.title'), '/drafts', sync.unsynced > 0 ? '${sync.unsynced}' : null),
      if (can('dues.view')) (Icons.request_quote_outlined, s.t('nav.dues'), '/dues', null),
      if (can('followups.view')) (Icons.event_note_outlined, s.t('nav.followUps'), '/follow-ups', null),
      if (can('cashbook.view')) (Icons.account_balance_wallet_outlined, s.t('mobile.cash.title'), '/cash', null),
      if (can('cashbook.view')) (Icons.lock_clock_outlined, s.t('nav.closing'), '/closing', null),
      (Icons.notifications_outlined, s.t('nav.notifications'), '/notifications', (ctx?.unreadNotifications ?? 0) > 0 ? '${ctx!.unreadNotifications}' : null),
      (Icons.settings_outlined, s.t('mobile.settings.title'), '/settings', null),
    ];
    return Scaffold(
      appBar: AppBar(title: Text(s.t('nav.more'))),
      body: ListView(padding: const EdgeInsets.all(Tokens.s4), children: [
        const SyncBanner(),
        const SizedBox(height: Tokens.s2),
        AppCard(
          padding: EdgeInsets.zero,
          child: Column(children: [
            for (final (icon, label, path, badge) in items)
              ListTile(
                leading: Icon(icon),
                title: Text(label),
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                  if (badge != null) Badge(label: Text(badge)),
                  const Icon(Icons.chevron_right_rounded),
                ]),
                onTap: () => context.push(path),
              ),
          ]),
        ),
      ]),
    );
  }
}

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  Future<void> _logout(BuildContext context, WidgetRef ref, {required bool all}) async {
    final s = context.s;
    final unsynced = ref.read(syncProvider).unsynced;
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(all ? s.t('auth.sessions.logoutAll') : s.t('common.logout')),
        content: Text([
          all ? s.t('mobile.settings.logoutAllConfirm') : s.t('mobile.settings.logoutConfirm'),
          if (unsynced > 0) s.t('mobile.settings.logoutDrafts', {'count': unsynced}),
        ].join('\n\n')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: Text(s.t('common.cancel'))),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: unsynced > 0 ? context.tokens.danger : null),
            onPressed: () => Navigator.pop(d, true),
            child: Text(all ? s.t('auth.sessions.logoutAll') : s.t('common.logout')),
          ),
        ],
      ),
    );
    if (ok == true) await ref.read(authProvider.notifier).logout(allDevices: all);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final auth = ref.watch(authProvider);
    final settings = ref.watch(settingsProvider);
    final me = auth.me;
    final active = me?.activeTenant;
    return Scaffold(
      appBar: AppBar(title: Text(s.t('mobile.settings.title'))),
      body: ListView(padding: const EdgeInsets.all(Tokens.s4), children: [
        AppCard(
          padding: EdgeInsets.zero,
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.account_circle_outlined),
              title: Text(s.t('mobile.settings.account')),
              subtitle: Text(me?.user.email ?? ''),
            ),
            ListTile(
              leading: const Icon(Icons.storefront_outlined),
              title: Text(s.t('mobile.settings.activeShop')),
              subtitle: Text(active == null ? '—' : '${active.name} · ${s.t('role.${active.role}')}'),
              trailing: (me?.tenants.length ?? 0) > 1 ? TextButton(onPressed: () => context.push('/select-shop'), child: Text(s.t('mobile.settings.switchShop'))) : null,
            ),
          ]),
        ),
        SectionTitle(s.t('mobile.settings.language')),
        SegmentedButton<String>(
          key: const Key('settings.language'),
          segments: [
            ButtonSegment(value: 'en', label: Text(s.t('language.en'))),
            ButtonSegment(value: 'hi', label: Text(s.t('language.hi'))),
          ],
          selected: {settings.languageCode},
          onSelectionChanged: (v) => ref.read(settingsProvider.notifier).setLanguage(v.first),
        ),
        SectionTitle(s.t('mobile.settings.theme')),
        SegmentedButton<ThemeMode>(
          segments: [
            ButtonSegment(value: ThemeMode.system, label: Text(s.t('mobile.settings.theme.system'), textAlign: TextAlign.center)),
            ButtonSegment(value: ThemeMode.light, label: Text(s.t('mobile.settings.theme.light'))),
            ButtonSegment(value: ThemeMode.dark, label: Text(s.t('mobile.settings.theme.dark'))),
          ],
          selected: {settings.themeMode},
          onSelectionChanged: (v) => ref.read(settingsProvider.notifier).setThemeMode(v.first),
        ),
        SectionTitle(s.t('nav.security')),
        AppCard(
          padding: EdgeInsets.zero,
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.devices_rounded),
              title: Text(s.t('auth.sessions.title')),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => context.push('/settings/sessions'),
            ),
            ListTile(
              key: const Key('settings.logout'),
              leading: const Icon(Icons.logout_rounded),
              title: Text(s.t('common.logout')),
              onTap: () => _logout(context, ref, all: false),
            ),
            ListTile(
              leading: Icon(Icons.phonelink_erase_rounded, color: context.tokens.danger),
              title: Text(s.t('auth.sessions.logoutAll'), style: TextStyle(color: context.tokens.danger)),
              onTap: () => _logout(context, ref, all: true),
            ),
          ]),
        ),
        const SizedBox(height: Tokens.s6),
        const Center(child: BrandMark(size: 40)),
        const SizedBox(height: Tokens.s2),
        Text(s.t('app.disclaimer'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: Tokens.s2),
        Text('${s.t('mobile.settings.apiServer')}: ${Env.apiBaseUrl}', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
      ]),
    );
  }
}

class SessionsScreen extends ConsumerWidget {
  const SessionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final tz = ref.watch(shopTimezoneProvider);
    return Scaffold(
      appBar: AppBar(title: Text(s.t('auth.sessions.title'))),
      body: AsyncView(
        value: ref.watch(sessionsProvider),
        onRetry: () => ref.invalidate(sessionsProvider),
        builder: (items) => ListView.separated(
          padding: const EdgeInsets.all(Tokens.s4),
          itemCount: items.length,
          separatorBuilder: (_, _) => const SizedBox(height: Tokens.s2),
          itemBuilder: (_, i) {
            final it = items[i];
            return AppCard(
              padding: const EdgeInsets.all(Tokens.s3),
              child: Row(children: [
                Icon(it.kind == 'MOBILE' ? Icons.smartphone_rounded : Icons.language_rounded),
                const SizedBox(width: Tokens.s3),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(it.deviceName ?? s.t('mobile.sessions.${it.kind}'), style: Theme.of(context).textTheme.titleSmall),
                    Text(s.t('mobile.sessions.lastSeen', {'time': formatDateTime(it.lastSeenAt, tz)}), style: TextStyle(color: context.tokens.textMuted)),
                    if (it.current) ...[
                      const SizedBox(height: 4),
                      StatusChip(label: s.t('auth.sessions.current'), tone: StatusTone.success, dense: true),
                    ],
                  ]),
                ),
                if (!it.current)
                  TextButton(
                    onPressed: () async {
                      try {
                        await ref.read(apiProvider).revokeSession(it.id);
                        ref.invalidate(sessionsProvider);
                        if (context.mounted) showSnack(context, s.t('mobile.sessions.signedOut'));
                      } on ApiException catch (e) {
                        if (context.mounted) showSnack(context, errorText(context, e), error: true);
                      }
                    },
                    child: Text(s.t('auth.sessions.revoke')),
                  ),
              ]),
            );
          },
        ),
      ),
    );
  }
}

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final tz = ref.watch(shopTimezoneProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(s.t('nav.notifications')),
        actions: [
          IconButton(
            tooltip: s.t('mobile.notifications.markAll'),
            icon: const Icon(Icons.done_all_rounded),
            onPressed: () async {
              try {
                await ref.read(apiProvider).markAllNotificationsRead();
                ref.invalidate(notificationsProvider);
                ref.invalidate(tenantContextProvider);
              } on ApiException catch (e) {
                if (context.mounted) showSnack(context, errorText(context, e), error: true);
              }
            },
          ),
        ],
      ),
      body: AsyncView(
        value: ref.watch(notificationsProvider),
        onRetry: () => ref.invalidate(notificationsProvider),
        builder: (page) => RefreshIndicator(
          onRefresh: () => ref.refresh(notificationsProvider.future),
          child: page.items.isEmpty
              ? ListView(children: [EmptyView(message: s.t('mobile.notifications.empty'), icon: Icons.notifications_none_rounded)])
              : ListView.separated(
                  padding: const EdgeInsets.all(Tokens.s4),
                  itemCount: page.items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: Tokens.s2),
                  itemBuilder: (_, i) {
                    final n = page.items[i];
                    return AppCard(
                      padding: const EdgeInsets.all(Tokens.s3),
                      onTap: n.isRead
                          ? null
                          : () async {
                              try {
                                await ref.read(apiProvider).markNotificationRead(n.id);
                                ref.invalidate(notificationsProvider);
                                ref.invalidate(tenantContextProvider);
                              } on ApiException catch (_) {}
                            },
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Icon(n.isRead ? Icons.notifications_none_rounded : Icons.notifications_active_rounded,
                            color: n.isRead ? context.tokens.textMuted : Theme.of(context).colorScheme.primary,
                            semanticLabel: n.isRead ? null : s.t('mobile.home.unread', {'count': 1})),
                        const SizedBox(width: Tokens.s3),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(n.title, style: TextStyle(fontWeight: n.isRead ? FontWeight.w500 : FontWeight.w700)),
                            const SizedBox(height: 2),
                            Text(n.body),
                            const SizedBox(height: 4),
                            Text(formatDateTime(n.createdAt, tz), style: Theme.of(context).textTheme.bodySmall),
                          ]),
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
