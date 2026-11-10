import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/api/api_exception.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';
import '../settings/settings_screens.dart';

String initialsOf(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  final first = parts.first.characters.first;
  final last = parts.length > 1 ? parts.last.characters.first : '';
  return (first + last).toUpperCase();
}

/// Round initials avatar used in the app bar and the profile sheet.
class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar({super.key, required this.name, this.size = 32});
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: context.tokens.brandAlt, shape: BoxShape.circle),
        child: Text(initialsOf(name), style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: size * 0.4)),
      );
}

/// Opens the account sheet from the avatar: profile, shop, preferences, links and sign-out.
Future<void> showProfileSheet(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => const FractionallySizedBox(heightFactor: 0.92, child: ProfileSheet()),
    );

class ProfileSheet extends ConsumerStatefulWidget {
  const ProfileSheet({super.key});

  @override
  ConsumerState<ProfileSheet> createState() => _ProfileSheetState();
}

class _ProfileSheetState extends ConsumerState<ProfileSheet> {
  bool _editing = false;
  bool _saving = false;
  String? _nameError;
  final _name = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _saveName() async {
    final s = context.s;
    final v = _name.text.trim();
    if (v.length < 2) {
      setState(() => _nameError = s.t('common.required'));
      return;
    }
    setState(() => _saving = true);
    try {
      final me = await ref.read(apiProvider).updateProfile(displayName: v);
      await ref.read(authProvider.notifier).applyMe(me);
      if (!mounted) return;
      setState(() {
        _editing = false;
        _nameError = null;
      });
      showSnack(context, s.t('mobile.profile.nameSaved'));
    } on ApiException catch (e) {
      if (mounted) setState(() => _nameError = e.fields['displayName']?.first ?? errorText(context, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _setLanguage(String code) {
    ref.read(settingsProvider.notifier).setLanguage(code);
    // Best effort: also remember it on the account so the web app matches.
    ref.read(apiProvider).updateProfile(locale: code).then((_) {}, onError: (_) {});
  }

  void _go(String path) {
    Navigator.of(context).pop();
    context.push(path);
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final t = context.tokens;
    final me = ref.watch(authProvider).me;
    final ctx = ref.watch(tenantContextProvider).value;
    final settings = ref.watch(settingsProvider);
    final unsynced = ref.watch(syncProvider.select((x) => x.unsynced));
    if (me == null) return const LoadingView();
    final user = me.user;
    final active = me.activeTenant;
    final place = [active?.district, active?.state].whereType<String>().where((x) => x.isNotEmpty).join(', ');
    final role = ctx?.role ?? active?.role;

    return ListView(padding: const EdgeInsets.fromLTRB(Tokens.s4, 0, Tokens.s4, Tokens.s6), children: [
      Text(s.t('mobile.profile.title'), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
      Text(s.t('mobile.profile.subtitle'), style: TextStyle(color: t.textMuted)),
      const SizedBox(height: Tokens.s4),
      // identity card
      Container(
        padding: const EdgeInsets.all(Tokens.s4),
        decoration: BoxDecoration(color: t.brand, borderRadius: BorderRadius.circular(Tokens.radiusXl)),
        child: Row(children: [
          Container(
            width: 56,
            height: 56,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(16)),
            child: Text(initialsOf(user.label), style: TextStyle(color: t.onBrand, fontWeight: FontWeight.w900, fontSize: 20)),
          ),
          const SizedBox(width: Tokens.s3),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(user.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.onBrand, fontWeight: FontWeight.w700, fontSize: Tokens.fontLg)),
              Text(user.email.isNotEmpty ? user.email : (user.phone ?? ''),
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.onBrand.withValues(alpha: 0.85), fontSize: Tokens.fontXs)),
              const SizedBox(height: 6),
              Wrap(spacing: 6, children: [
                if (role != null) _pill(context, s.t('role.$role')),
                if (ctx != null) _pill(context, ctx.planName),
              ]),
            ]),
          ),
        ]),
      ),
      SectionTitle(s.t('mobile.profile.details')),
      AppCard(
        padding: EdgeInsets.zero,
        child: Column(children: [
          ListTile(
            leading: const Icon(Icons.edit_outlined),
            title: Text(s.t('mobile.profile.name'), style: TextStyle(fontSize: Tokens.fontXs, color: t.textMuted)),
            subtitle: _editing
                ? Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Row(children: [
                      Expanded(
                        child: TextField(
                          key: const Key('profile.name'),
                          controller: _name,
                          autofocus: true,
                          maxLength: 60,
                          textInputAction: TextInputAction.done,
                          onSubmitted: (_) => _saveName(),
                          decoration: InputDecoration(isDense: true, counterText: '', hintText: s.t('mobile.profile.nameHint'), errorText: _nameError),
                        ),
                      ),
                      IconButton(
                        key: const Key('profile.saveName'),
                        tooltip: s.t('common.save'),
                        onPressed: _saving ? null : _saveName,
                        icon: _saving ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.check_rounded),
                      ),
                      IconButton(
                        tooltip: s.t('common.cancel'),
                        onPressed: () => setState(() {
                          _editing = false;
                          _nameError = null;
                        }),
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ]),
                  )
                : Text(user.displayName ?? '—', style: const TextStyle(fontWeight: FontWeight.w600)),
            trailing: _editing
                ? null
                : TextButton(
                    key: const Key('profile.editName'),
                    onPressed: () => setState(() {
                      _name.text = user.displayName ?? '';
                      _editing = true;
                    }),
                    child: Text(s.t('mobile.profile.edit')),
                  ),
          ),
          _infoTile(context, Icons.mail_outline_rounded, s.t('mobile.profile.email'), user.email.isEmpty ? '—' : user.email),
          _infoTile(context, Icons.phone_outlined, s.t('mobile.profile.mobile'), (user.phone ?? '').isEmpty ? '—' : '+91 ${user.phone}'),
        ]),
      ),
      SectionTitle(s.t('mobile.profile.shop')),
      AppCard(
        padding: EdgeInsets.zero,
        child: Column(children: [
          _infoTile(context, Icons.storefront_outlined, s.t('mobile.profile.currentShop'), ctx?.tenant.name ?? active?.name ?? '—'),
          if (place.isNotEmpty) _infoTile(context, Icons.place_outlined, s.t('mobile.profile.location'), place),
          if (me.tenants.length > 1)
            _linkTile(context, Icons.swap_horiz_rounded, '${s.t('mobile.settings.switchShop')} (${me.tenants.length})', () => _go('/select-shop')),
        ]),
      ),
      SectionTitle(s.t('mobile.profile.preferences')),
      AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(s.t('mobile.settings.language'), style: TextStyle(fontSize: Tokens.fontXs, color: t.textMuted)),
          const SizedBox(height: 6),
          SegmentedButton<String>(
            key: const Key('profile.language'),
            segments: [
              ButtonSegment(value: 'en', label: Text(s.t('language.en'))),
              ButtonSegment(value: 'hi', label: Text(s.t('language.hi'))),
            ],
            selected: {settings.languageCode},
            onSelectionChanged: (v) => _setLanguage(v.first),
          ),
          const SizedBox(height: Tokens.s3),
          Text(s.t('mobile.settings.theme'), style: TextStyle(fontSize: Tokens.fontXs, color: t.textMuted)),
          const SizedBox(height: 6),
          SegmentedButton<ThemeMode>(
            segments: [
              ButtonSegment(value: ThemeMode.light, icon: const Icon(Icons.light_mode_outlined, size: 18), label: Text(s.t('mobile.settings.theme.light'))),
              ButtonSegment(value: ThemeMode.dark, icon: const Icon(Icons.dark_mode_outlined, size: 18), label: Text(s.t('mobile.settings.theme.dark'))),
              ButtonSegment(value: ThemeMode.system, icon: const Icon(Icons.phone_android_rounded, size: 18), label: Text(s.t('mobile.settings.theme.system'))),
            ],
            selected: {settings.themeMode},
            onSelectionChanged: (v) => ref.read(settingsProvider.notifier).setThemeMode(v.first),
          ),
        ]),
      ),
      SectionTitle(s.t('mobile.profile.quickLinks')),
      AppCard(
        padding: EdgeInsets.zero,
        child: Column(children: [
          _linkTile(context, Icons.phone_android_rounded, s.t('mobile.drafts.title'), () => _go('/drafts'), badge: unsynced > 0 ? '$unsynced' : null),
          _linkTile(context, Icons.devices_rounded, s.t('auth.sessions.title'), () => _go('/settings/sessions')),
          _linkTile(context, Icons.settings_outlined, s.t('mobile.profile.allSettings'), () => _go('/settings')),
        ]),
      ),
      const SizedBox(height: Tokens.s5),
      OutlinedButton.icon(
        key: const Key('profile.logout'),
        style: OutlinedButton.styleFrom(
          foregroundColor: t.danger,
          side: BorderSide(color: t.danger.withValues(alpha: 0.5)),
          minimumSize: const Size.fromHeight(Tokens.touchTarget),
        ),
        onPressed: () => confirmLogout(context, ref, all: false),
        icon: const Icon(Icons.logout_rounded),
        label: Text(s.t('common.logout')),
      ),
      TextButton(
        onPressed: () => confirmLogout(context, ref, all: true),
        child: Text(s.t('auth.sessions.logoutAll'), style: TextStyle(color: t.textMuted)),
      ),
    ]);
  }

  Widget _pill(BuildContext context, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(Tokens.radiusPill)),
        child: Text(text, style: TextStyle(color: context.tokens.onBrand, fontSize: 11, fontWeight: FontWeight.w700)),
      );

  Widget _infoTile(BuildContext context, IconData icon, String label, String value) => ListTile(
        leading: Icon(icon),
        title: Text(label, style: TextStyle(fontSize: Tokens.fontXs, color: context.tokens.textMuted)),
        subtitle: Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
      );

  Widget _linkTile(BuildContext context, IconData icon, String label, VoidCallback onTap, {String? badge}) => ListTile(
        leading: Icon(icon),
        title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
          if (badge != null) Badge(label: Text(badge)),
          const Icon(Icons.chevron_right_rounded),
        ]),
        onTap: onTap,
      );
}
