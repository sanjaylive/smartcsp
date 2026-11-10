import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api/api_exception.dart';
import '../../data/models/payment_models.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';
import 'payment_widgets.dart';

/// Integrations → Pay2All: connection (Offline / Test / Live), API token and Live services.
class IntegrationsScreen extends ConsumerWidget {
  const IntegrationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
        appBar: AppBar(title: Text(context.s.t('nav.integrations'))),
        body: AsyncView(
          value: ref.watch(integrationsProvider),
          onRetry: () => ref.invalidate(integrationsProvider),
          builder: (o) => _Pay2AllForm(key: ValueKey('${o.mode}${o.enabledServices.join()}'), overview: o),
        ),
      );
}

class _Pay2AllForm extends ConsumerStatefulWidget {
  const _Pay2AllForm({super.key, required this.overview});
  final ConnectorOverview overview;

  @override
  ConsumerState<_Pay2AllForm> createState() => _Pay2AllFormState();
}

class _Pay2AllFormState extends ConsumerState<_Pay2AllForm> {
  late String _mode = widget.overview.mode;
  late final Set<String> _live = widget.overview.enabledServices.toSet();
  final _token = TextEditingController();
  bool _busy = false;
  bool _checking = false;
  String? _health;

  ConnectorOverview get o => widget.overview;

  bool _canLive(String code) => switch (_mode) {
        'SIMULATOR' => o.supportedServices.contains(code),
        'UAT' => o.uatServices.contains(code),
        'LIVE' => o.liveServices.contains(code),
        _ => false,
      };

  @override
  void dispose() {
    _token.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await ref.read(apiProvider).configurePay2all(mode: _mode, enabledServices: _live.where(_canLive).toList(), apiToken: _token.text);
      ref.invalidate(integrationsProvider);
      ref.invalidate(tenantContextProvider);
      if (mounted) showSnack(context, context.s.t('mobile.p2a.savedOk'));
    } on ApiException catch (e) {
      if (mounted) showSnack(context, errorText(context, e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _check() async {
    setState(() => _checking = true);
    try {
      final (ok, detail) = await ref.read(apiProvider).pay2allHealth();
      setState(() => _health = detail);
      if (mounted) showSnack(context, detail, error: !ok);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, errorText(context, e), error: true);
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final t = context.tokens;
    final manage = ref.watch(tenantContextProvider).value?.can('integrations.manage') ?? false;
    final shop = ref.watch(tenantContextProvider).value;
    final selected = shop?.services.where((x) => x.selected).map((x) => x.code).toSet() ?? {};
    final rows = [...o.liveServices, ...o.pendingServices.where((x) => !o.liveServices.contains(x))]
        .where((c) => selected.contains(c) || o.liveServices.contains(c))
        .toList();
    final enabled = manage && o.planAllows;
    final modes = [
      ('DISABLED', s.t('mobile.p2a.offline'), s.t('mobile.p2a.offlineHelp'), Icons.edit_note_rounded),
      ('UAT', s.t('mobile.p2a.uat'), s.t('mobile.p2a.uatHelp'), Icons.science_outlined),
      ('LIVE', s.t('mobile.p2a.live'), s.t('mobile.p2a.liveHelp'), Icons.bolt_rounded),
      if (o.simulatorAvailable) ('SIMULATOR', s.t('mobile.p2a.simulator'), s.t('mobile.p2a.simulatorHelp'), Icons.science_rounded),
    ];

    return ListView(padding: const EdgeInsets.all(Tokens.s4), children: [
      InfoBanner(text: s.t('mobile.p2a.notice')),
      if (!o.planAllows) ...[
        const SizedBox(height: Tokens.s2),
        InfoBanner(text: s.t('mobile.p2a.planRequired'), tone: BannerTone.warning),
      ],
      SectionTitle(s.t('mobile.p2a.connection')),
      for (final (value, title, help, icon) in modes)
        Padding(
          padding: const EdgeInsets.only(bottom: Tokens.s2),
          child: AppCard(
            padding: EdgeInsets.zero,
            color: _mode == value ? t.brand.withValues(alpha: 0.08) : null,
            child: ListTile(
              key: Key('p2a.mode.$value'),
              onTap: enabled ? () => setState(() => _mode = value) : null,
              leading: Icon(icon, color: _mode == value ? t.brand : t.textMuted),
              title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(help),
              trailing: Icon(_mode == value ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded, color: _mode == value ? t.brand : t.textMuted),
            ),
          ),
        ),
      if (_mode == 'UAT' || _mode == 'LIVE') ...[
        SectionTitle(s.t('mobile.p2a.token')),
        TextField(
          key: const Key('p2a.token'),
          controller: _token,
          enabled: enabled,
          obscureText: true,
          autocorrect: false,
          decoration: InputDecoration(
            labelText: s.t('mobile.p2a.token'),
            hintText: o.hasCredentials ? '•••••••• (${s.t('mobile.p2a.saved')})' : null,
            helperText: o.maskedToken != null ? s.t('mobile.p2a.tokenSaved', {'mask': o.maskedToken!}) : s.t('mobile.p2a.tokenHelp'),
            helperMaxLines: 2,
          ),
        ),
      ],
      SectionTitle(s.t('mobile.p2a.perService')),
      AppCard(
        padding: EdgeInsets.zero,
        child: Column(children: [
          for (final code in rows)
            Builder(builder: (context) {
              final pending = o.pendingServices.contains(code) && _mode != 'SIMULATOR';
              final can = _canLive(code) && !pending;
              final on = _live.contains(code) && can;
              return ListTile(
                leading: ServiceAvatar(serviceCode: code, size: 36),
                title: Text(serviceLabel(s, code)),
                subtitle: Text(s.t(pending
                    ? 'mobile.p2a.pending'
                    : !can
                        ? (_mode == 'UAT' ? 'mobile.p2a.uatOnly' : 'mobile.p2a.chooseMode')
                        : on
                            ? 'mobile.p2a.sentLive'
                            : 'mobile.p2a.recorded')),
                trailing: SegmentedButton<bool>(
                  showSelectedIcon: false,
                  style: const ButtonStyle(visualDensity: VisualDensity.compact),
                  segments: [
                    ButtonSegment(value: false, label: Text(s.t('mobile.p2a.offline'))),
                    ButtonSegment(value: true, label: Text(s.t('mobile.p2a.liveShort')), enabled: can),
                  ],
                  selected: {on},
                  onSelectionChanged: enabled ? (v) => setState(() => v.first ? _live.add(code) : _live.remove(code)) : null,
                ),
              );
            }),
        ]),
      ),
      if (o.callbackUrl != null && (o.mode == 'LIVE' || o.mode == 'UAT')) ...[
        SectionTitle(s.t('mobile.p2a.callback')),
        AppCard(
          color: t.surfaceMuted,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(s.t('mobile.p2a.callbackHelp'), style: TextStyle(color: t.textMuted, fontSize: 13)),
            const SizedBox(height: Tokens.s2),
            Row(children: [
              Expanded(child: SelectableText(o.callbackUrl!, style: const TextStyle(fontSize: 12, fontFeatures: moneyFeatures))),
              CopyChip(text: o.callbackUrl!),
            ]),
          ]),
        ),
      ],
      const SizedBox(height: Tokens.s4),
      if (manage)
        FilledButton(
          key: const Key('p2a.save'),
          onPressed: _busy || !o.planAllows ? null : _save,
          child: _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : Text(s.t('common.save')),
        )
      else
        Text(s.t('mobile.p2a.viewOnly'), style: TextStyle(color: t.textMuted)),
      if (manage && o.mode != 'DISABLED') ...[
        const SizedBox(height: Tokens.s2),
        OutlinedButton.icon(
          onPressed: _checking ? null : _check,
          icon: const Icon(Icons.wifi_tethering_rounded),
          label: Text(s.t('mobile.p2a.check')),
        ),
      ],
      if ((_health ?? o.lastHealthStatus) != null) ...[
        const SizedBox(height: Tokens.s2),
        Text(_health ?? o.lastHealthStatus!, textAlign: TextAlign.center, style: TextStyle(color: t.textMuted, fontSize: 12)),
      ],
      const SizedBox(height: Tokens.s6),
    ]);
  }
}
