import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dates.dart';
import '../../data/api/api_exception.dart';
import '../../data/models/tenant_models.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

/// Opens the notifications sheet from the bell.
Future<void> showNotificationsSheet(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => const FractionallySizedBox(heightFactor: 0.92, child: NotificationsPanel()),
    );

/// Maps a web link (`/app/...`) to the matching mobile screen; null when the app has no such screen.
String? mobileRouteFor(String? link) {
  if (link == null || !link.startsWith('/app/') || link.startsWith('//')) return null;
  final path = link.substring(4).split('?').first;
  const direct = {'/follow-ups': '/follow-ups', '/closing': '/closing', '/dues': '/dues', '/cashbook': '/cash', '/notifications': '/notifications'};
  if (direct.containsKey(path)) return direct[path];
  final rec = RegExp(r'^/records/([A-Za-z0-9-]{8,64})$').firstMatch(path);
  return rec == null ? null : '/records/${rec.group(1)}';
}

enum _Tone { info, warning, success, danger, brand }

({IconData icon, _Tone tone, String kind}) _kindOf(String type) => switch (type) {
      'FOLLOWUPS_DUE' => (icon: Icons.event_note_rounded, tone: _Tone.info, kind: 'followups'),
      'SUBSCRIPTION' => (icon: Icons.credit_card_rounded, tone: _Tone.warning, kind: 'billing'),
      'EXPORT_READY' => (icon: Icons.download_rounded, tone: _Tone.success, kind: 'export'),
      'SUPPORT_ACCESS' => (icon: Icons.support_agent_rounded, tone: _Tone.warning, kind: 'support'),
      'CLOSING_VARIANCE' => (icon: Icons.balance_rounded, tone: _Tone.danger, kind: 'closing'),
      'CLOSING_VARIANCE_REVERSAL' => (icon: Icons.balance_rounded, tone: _Tone.info, kind: 'closing'),
      'REOPEN_REQUESTED' => (icon: Icons.lock_open_rounded, tone: _Tone.warning, kind: 'closing'),
      'TENANT_STATUS' => (icon: Icons.storefront_rounded, tone: _Tone.danger, kind: 'shop'),
      'OVERRIDE_SET' => (icon: Icons.tune_rounded, tone: _Tone.info, kind: 'plan'),
      _ => (icon: Icons.notifications_rounded, tone: _Tone.brand, kind: 'update'),
    };

String relativeTime(AppStrings s, String iso, String tz, {DateTime? now}) {
  final at = DateTime.tryParse(iso);
  if (at == null) return '';
  final secs = (now ?? DateTime.now()).difference(at).inSeconds.clamp(0, 1 << 31);
  if (secs < 60) return s.t('mobile.notifications.justNow');
  if (secs < 3600) return s.t('mobile.notifications.minAgo', {'n': secs ~/ 60});
  if (secs < 86400) return s.t('mobile.notifications.hAgo', {'n': secs ~/ 3600});
  if (secs < 7 * 86400) return s.t('mobile.notifications.dAgo', {'n': secs ~/ 86400});
  return formatDateTime(iso, tz);
}

String _dayGroup(String iso, {DateTime? now}) {
  final at = DateTime.tryParse(iso)?.toLocal();
  final n = now ?? DateTime.now();
  final today = DateTime(n.year, n.month, n.day);
  if (at == null || !at.isBefore(today)) return 'today';
  if (!at.isBefore(today.subtract(const Duration(days: 1)))) return 'yesterday';
  if (!at.isBefore(today.subtract(const Duration(days: 7)))) return 'thisWeek';
  return 'earlier';
}

/// Feed with All / Unread tabs, day groups, mark read and load more. Used by the sheet and the
/// `/notifications` screen.
class NotificationsPanel extends ConsumerStatefulWidget {
  const NotificationsPanel({super.key, this.inSheet = true});
  final bool inSheet;

  @override
  ConsumerState<NotificationsPanel> createState() => _NotificationsPanelState();
}

class _NotificationsPanelState extends ConsumerState<NotificationsPanel> {
  bool _unreadOnly = false;
  final List<AppNotification> _items = [];
  int _page = 0;
  int _pages = 1;
  int _unread = 0;
  bool _loading = true;
  bool _loadingMore = false;
  bool _markingAll = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final r = await ref.read(apiProvider).notificationsFeed(page: 1, unreadOnly: _unreadOnly);
      if (!mounted) return;
      setState(() {
        _items
          ..clear()
          ..addAll(r.page.items);
        _page = r.page.page;
        _pages = r.page.pages;
        _unread = r.unread;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _more() async {
    setState(() => _loadingMore = true);
    try {
      final r = await ref.read(apiProvider).notificationsFeed(page: _page + 1, unreadOnly: _unreadOnly);
      if (!mounted) return;
      setState(() {
        _items.addAll(r.page.items.where((n) => !_items.any((x) => x.id == n.id)));
        _page = r.page.page;
        _pages = r.page.pages;
        _unread = r.unread;
      });
    } on ApiException catch (e) {
      if (mounted) showSnack(context, errorText(context, e), error: true);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  void _refreshBadges() {
    ref.invalidate(unreadCountProvider);
    ref.invalidate(tenantContextProvider);
    ref.invalidate(notificationsProvider);
  }

  Future<void> _markRead(AppNotification n) async {
    if (n.isRead) return;
    // Optimistic: the dot disappears immediately.
    final i = _items.indexWhere((x) => x.id == n.id);
    setState(() {
      if (i >= 0) {
        _items[i] = AppNotification(id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, readAt: DateTime.now().toUtc().toIso8601String(), createdAt: n.createdAt);
      }
      _unread = (_unread - 1).clamp(0, 1 << 31);
      if (_unreadOnly && i >= 0) _items.removeAt(i);
    });
    try {
      await ref.read(apiProvider).markNotificationRead(n.id);
    } on ApiException catch (_) {}
    _refreshBadges();
  }

  Future<void> _markAll() async {
    setState(() => _markingAll = true);
    try {
      await ref.read(apiProvider).markAllNotificationsRead();
      _refreshBadges();
      await _reload();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, errorText(context, e), error: true);
    } finally {
      if (mounted) setState(() => _markingAll = false);
    }
  }

  void _open(AppNotification n) {
    _markRead(n);
    final route = mobileRouteFor(n.link);
    if (route == null) return;
    if (widget.inSheet) Navigator.of(context).pop();
    context.push(route);
  }

  Color _bg(BuildContext c, _Tone t) => switch (t) {
        _Tone.info => c.tokens.info.withValues(alpha: 0.12),
        _Tone.warning => c.tokens.warning.withValues(alpha: 0.14),
        _Tone.success => c.tokens.success.withValues(alpha: 0.12),
        _Tone.danger => c.tokens.danger.withValues(alpha: 0.12),
        _Tone.brand => c.tokens.brand.withValues(alpha: 0.12),
      };
  Color _fg(BuildContext c, _Tone t) => switch (t) {
        _Tone.info => c.tokens.info,
        _Tone.warning => c.tokens.warning,
        _Tone.success => c.tokens.success,
        _Tone.danger => c.tokens.danger,
        _Tone.brand => c.tokens.brand,
      };

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final t = context.tokens;
    final tz = ref.watch(shopTimezoneProvider);

    final header = Padding(
      padding: const EdgeInsets.fromLTRB(Tokens.s4, 0, Tokens.s4, Tokens.s2),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (widget.inSheet) ...[
          Row(children: [
            Badge(
              isLabelVisible: _unread > 0,
              label: Text(_unread > 99 ? '99+' : '$_unread'),
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: t.brand.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                child: Icon(Icons.notifications_rounded, color: t.brand),
              ),
            ),
            const SizedBox(width: Tokens.s3),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.t('nav.notifications'), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                Text(_unread > 0 ? s.t('mobile.notifications.unreadCount', {'count': _unread}) : s.t('mobile.notifications.caughtUp'),
                    style: TextStyle(color: t.textMuted, fontSize: Tokens.fontXs)),
              ]),
            ),
          ]),
          const SizedBox(height: Tokens.s3),
        ],
        Row(children: [
          SegmentedButton<bool>(
            key: const Key('notifications.filter'),
            showSelectedIcon: false,
            segments: [
              ButtonSegment(value: false, label: Text(s.t('mobile.notifications.all'))),
              ButtonSegment(value: true, label: Text(_unread > 0 ? '${s.t('mobile.notifications.unread')} · $_unread' : s.t('mobile.notifications.unread'))),
            ],
            selected: {_unreadOnly},
            onSelectionChanged: (v) {
              setState(() => _unreadOnly = v.first);
              _reload();
            },
          ),
          const Spacer(),
          if (_unread > 0)
            TextButton.icon(
              key: const Key('notifications.markAll'),
              onPressed: _markingAll ? null : _markAll,
              icon: _markingAll ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.done_all_rounded, size: 18),
              label: Text(s.t('mobile.notifications.markAll')),
            ),
        ]),
      ]),
    );

    Widget body;
    if (_loading) {
      body = const LoadingView();
    } else if (_error != null) {
      body = ErrorView(error: _error!, onRetry: _reload);
    } else if (_items.isEmpty) {
      body = ListView(children: [
        const SizedBox(height: Tokens.s8),
        Icon(Icons.notifications_off_outlined, size: 48, color: t.textMuted),
        const SizedBox(height: Tokens.s3),
        Text(_unreadOnly ? s.t('mobile.notifications.emptyUnread') : s.t('mobile.notifications.empty'),
            textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: Tokens.s1),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Tokens.s8),
          child: Text(s.t('mobile.notifications.emptyHint'), textAlign: TextAlign.center, style: TextStyle(color: t.textMuted)),
        ),
      ]);
    } else {
      final rows = <Widget>[];
      String? group;
      for (final n in _items) {
        final g = _dayGroup(n.createdAt);
        if (g != group) {
          group = g;
          rows.add(Padding(
            padding: const EdgeInsets.fromLTRB(Tokens.s1, Tokens.s3, Tokens.s1, Tokens.s1),
            child: Text(s.t('mobile.notifications.$g').toUpperCase(),
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.8, color: t.textMuted)),
          ));
        }
        rows.add(_tile(context, s, n, tz));
      }
      if (_page < _pages) {
        rows.add(Padding(
          padding: const EdgeInsets.only(top: Tokens.s3),
          child: OutlinedButton(
            onPressed: _loadingMore ? null : _more,
            child: _loadingMore ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Text(s.t('mobile.notifications.loadMore')),
          ),
        ));
      }
      body = ListView(padding: const EdgeInsets.fromLTRB(Tokens.s4, 0, Tokens.s4, Tokens.s6), children: rows);
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      header,
      const Divider(height: 1),
      Expanded(child: RefreshIndicator(onRefresh: _reload, child: body)),
    ]);
  }

  Widget _tile(BuildContext context, AppStrings s, AppNotification n, String tz) {
    final t = context.tokens;
    final k = _kindOf(n.type);
    final route = mobileRouteFor(n.link);
    return Padding(
      padding: const EdgeInsets.only(bottom: Tokens.s2),
      child: Material(
        color: n.isRead ? Colors.transparent : t.brand.withValues(alpha: 0.06),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: n.isRead ? t.border : t.brand.withValues(alpha: 0.25)),
        ),
        child: InkWell(
          key: Key('notification.${n.id}'),
          borderRadius: BorderRadius.circular(16),
          onTap: () => _open(n),
          child: Padding(
            padding: const EdgeInsets.all(Tokens.s3),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: _bg(context, k.tone), borderRadius: BorderRadius.circular(12)),
                child: Icon(k.icon, size: 20, color: _fg(context, k.tone)),
              ),
              const SizedBox(width: Tokens.s3),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Expanded(child: Text(n.title, style: TextStyle(fontWeight: n.isRead ? FontWeight.w500 : FontWeight.w700))),
                    if (!n.isRead)
                      Semantics(
                        label: s.t('mobile.notifications.unread'),
                        child: Container(
                          margin: const EdgeInsets.only(top: 6, left: 6),
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(color: t.brand, shape: BoxShape.circle),
                        ),
                      ),
                  ]),
                  if (n.body.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(n.body, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.textMuted, fontSize: 13)),
                  ],
                  const SizedBox(height: 6),
                  Row(children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(color: t.surfaceMuted, borderRadius: BorderRadius.circular(Tokens.radiusPill)),
                      child: Text(s.t('mobile.notifications.kind.${k.kind}'), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                    ),
                    const SizedBox(width: 8),
                    Text(relativeTime(s, n.createdAt, tz), style: TextStyle(fontSize: 11, color: t.textMuted)),
                    const Spacer(),
                    if (route != null)
                      Row(children: [
                        Text(s.t('mobile.notifications.open'), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: t.brand)),
                        Icon(Icons.chevron_right_rounded, size: 16, color: t.brand),
                      ]),
                  ]),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
