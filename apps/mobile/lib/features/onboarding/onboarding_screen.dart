import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/registry/field_validation.dart';
import '../../core/registry/services.dart';
import '../../data/api/api_exception.dart';
import '../../data/models/auth_models.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

const indianStates = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

final _onboardingProvider = FutureProvider.autoDispose<OnboardingState>((ref) => ref.watch(apiProvider).onboarding());

/// Resumable onboarding: shop details → services → create shop (idempotent on the server).
class OnboardingScreen extends ConsumerWidget {
  const OnboardingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    return Scaffold(
      appBar: AppBar(
        title: Text(s.t('onboarding.shop.title')),
        actions: [
          IconButton(tooltip: s.t('common.logout'), icon: const Icon(Icons.logout_rounded), onPressed: () => ref.read(authProvider.notifier).logout()),
        ],
      ),
      body: AsyncView(
        value: ref.watch(_onboardingProvider),
        onRetry: () => ref.invalidate(_onboardingProvider),
        builder: (state) => _OnboardingFlow(initial: state),
      ),
    );
  }
}

class _OnboardingFlow extends ConsumerStatefulWidget {
  const _OnboardingFlow({required this.initial});
  final OnboardingState initial;

  @override
  ConsumerState<_OnboardingFlow> createState() => _OnboardingFlowState();
}

class _OnboardingFlowState extends ConsumerState<_OnboardingFlow> {
  late int _step = widget.initial.step == 'SERVICES' && widget.initial.shop != null ? 1 : 0;
  late final _shopName = TextEditingController(text: widget.initial.shop?.shopName);
  late final _ownerName = TextEditingController(text: widget.initial.shop?.ownerName);
  late final _phone = TextEditingController(text: widget.initial.shop?.contactPhone);
  late final _district = TextEditingController(text: widget.initial.shop?.district);
  late final _address = TextEditingController(text: widget.initial.shop?.address);
  late String? _state = indianStates.contains(widget.initial.shop?.state) ? widget.initial.shop?.state : null;
  late String _lang = widget.initial.shop?.preferredLanguage ?? ref.read(settingsProvider).languageCode;
  late final Set<String> _services = {...widget.initial.services};
  Map<String, String> _errors = {};
  String? _formError;
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_shopName, _ownerName, _phone, _district, _address]) {
      c.dispose();
    }
    super.dispose();
  }

  Map<String, String> _validateShop(AppStrings s) {
    final e = <String, String>{};
    void put(String k, ValidationIssue? i) {
      if (i != null) e[k] = s.issue(i);
    }

    put('shopName', validateSafeText(_shopName.text, max: 80, min: 2, required: true));
    put('ownerName', validateSafeText(_ownerName.text, max: 80, min: 2, required: true));
    put('contactPhone', validatePhone(_phone.text));
    if (_state == null) e['state'] = s.t('common.required');
    put('district', validateSafeText(_district.text, max: 60, min: 2, required: true));
    put('address', validateSafeText(_address.text, max: 240));
    return e;
  }

  void _applyApiError(ApiException e) {
    setState(() {
      _errors = {for (final f in e.fields.entries) f.key: f.value.first};
      _formError = errorText(context, e);
    });
  }

  Future<void> _saveShop() async {
    final s = context.s;
    final errors = _validateShop(s);
    setState(() {
      _errors = errors;
      _formError = null;
    });
    if (errors.isNotEmpty) return;
    setState(() => _busy = true);
    try {
      await ref.read(apiProvider).saveShop(ShopSetup(
            shopName: _shopName.text,
            ownerName: _ownerName.text,
            contactPhone: _phone.text,
            state: _state!,
            district: _district.text,
            address: _address.text,
            preferredLanguage: _lang,
          ));
      await ref.read(settingsProvider.notifier).setLanguage(_lang);
      setState(() => _step = 1);
    } on ApiException catch (e) {
      _applyApiError(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _finish() async {
    final s = context.s;
    if (_services.isEmpty) {
      setState(() => _formError = s.t('onboarding.services.help'));
      return;
    }
    setState(() {
      _busy = true;
      _formError = null;
    });
    try {
      final api = ref.read(apiProvider);
      final ordered = serviceCodes.where(_services.contains).toList();
      await api.saveServices(ordered);
      final me = await api.completeOnboarding();
      await ref.read(authProvider.notifier).applyMe(me);
    } on ApiException catch (e) {
      _applyApiError(e);
      if (e.details['step'] == 'SHOP') setState(() => _step = 0);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    return SafeArea(
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Tokens.s4, Tokens.s2, Tokens.s4, 0),
          child: Row(children: [
            Text(s.t('onboarding.step', {'current': _step + 1, 'total': 2}), style: TextStyle(color: context.tokens.textMuted)),
            const SizedBox(width: Tokens.s3),
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(value: (_step + 1) / 2, minHeight: 6),
              ),
            ),
          ]),
        ),
        Expanded(child: _step == 0 ? _shopStep(s) : _servicesStep(s)),
      ]),
    );
  }

  Widget _field(String key, TextEditingController c, String label,
          {String? help, TextInputType? type, int maxLines = 1, Iterable<String>? autofill}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: Tokens.s3),
        child: TextField(
          key: Key('onboarding.$key'),
          controller: c,
          keyboardType: type,
          maxLines: maxLines,
          autofillHints: autofill,
          textInputAction: maxLines > 1 ? TextInputAction.newline : TextInputAction.next,
          decoration: InputDecoration(labelText: label, helperText: help, errorText: _errors[key]),
        ),
      );

  Widget _shopStep(AppStrings s) => ListView(
        padding: const EdgeInsets.all(Tokens.s4),
        children: [
          if (_formError != null) ...[InfoBanner(text: _formError!, tone: BannerTone.danger), const SizedBox(height: Tokens.s3)],
          _field('shopName', _shopName, s.t('onboarding.shop.shopName'), autofill: const [AutofillHints.organizationName]),
          _field('ownerName', _ownerName, s.t('onboarding.shop.ownerName'), autofill: const [AutofillHints.name]),
          _field('contactPhone', _phone, '${s.t('onboarding.shop.phone')} (${s.t('common.optional')})',
              help: s.t('onboarding.shop.phoneHelp'), type: TextInputType.phone, autofill: const [AutofillHints.telephoneNumberNational]),
          Padding(
            padding: const EdgeInsets.only(bottom: Tokens.s3),
            child: DropdownButtonFormField<String>(
              key: const Key('onboarding.state'),
              initialValue: _state,
              isExpanded: true,
              decoration: InputDecoration(labelText: s.t('onboarding.shop.state'), errorText: _errors['state']),
              items: [for (final st in indianStates) DropdownMenuItem(value: st, child: Text(st))],
              onChanged: (v) => setState(() => _state = v),
            ),
          ),
          _field('district', _district, s.t('onboarding.shop.district')),
          _field('address', _address, '${s.t('onboarding.shop.address')} (${s.t('common.optional')})', maxLines: 2),
          Text(s.t('onboarding.shop.language'), style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: Tokens.s2),
          SegmentedButton<String>(
            segments: [
              ButtonSegment(value: 'en', label: Text(s.t('language.en'))),
              ButtonSegment(value: 'hi', label: Text(s.t('language.hi'))),
            ],
            selected: {_lang},
            onSelectionChanged: (v) => setState(() => _lang = v.first),
          ),
          const SizedBox(height: Tokens.s6),
          FilledButton(
            key: const Key('onboarding.next'),
            onPressed: _busy ? null : _saveShop,
            child: _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : Text(s.t('common.continue')),
          ),
        ],
      );

  Widget _servicesStep(AppStrings s) {
    final available = serviceCodes.where(widget.initial.availableServices.contains).toList();
    final limit = widget.initial.enabledServiceLimit;
    final overLimit = limit != null && _services.length > limit;
    return Column(children: [
      Expanded(
        child: ListView(
          padding: const EdgeInsets.all(Tokens.s4),
          children: [
            Text(s.t('onboarding.services.title'), style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: Tokens.s2),
            InfoBanner(text: s.t('onboarding.services.help')),
            if (limit != null) ...[
              const SizedBox(height: Tokens.s2),
              InfoBanner(
                text: s.t('mobile.onboarding.planLimit', {'plan': widget.initial.planName, 'limit': limit}),
                tone: overLimit ? BannerTone.warning : BannerTone.info,
              ),
            ],
            if (_formError != null) ...[const SizedBox(height: Tokens.s2), InfoBanner(text: _formError!, tone: BannerTone.danger)],
            const SizedBox(height: Tokens.s3),
            for (final code in available) ...[
              _ServiceCard(
                code: code,
                selected: _services.contains(code),
                onChanged: (v) => setState(() => v ? _services.add(code) : _services.remove(code)),
              ),
              const SizedBox(height: Tokens.s2),
            ],
          ],
        ),
      ),
      Container(
        padding: const EdgeInsets.all(Tokens.s4),
        decoration: BoxDecoration(color: context.tokens.surface, border: Border(top: BorderSide(color: context.tokens.border))),
        child: Row(children: [
          OutlinedButton(onPressed: _busy ? null : () => setState(() => _step = 0), child: Text(s.t('common.back'))),
          const SizedBox(width: Tokens.s3),
          Expanded(
            child: FilledButton(
              key: const Key('onboarding.finish'),
              onPressed: _busy || _services.isEmpty || overLimit ? null : _finish,
              child: _busy
                  ? Text(s.t('onboarding.creating'))
                  : Text('${s.t('onboarding.finish')} · ${s.t('onboarding.services.selected', {'count': _services.length})}'),
            ),
          ),
        ]),
      ),
    ]);
  }
}

class _ServiceCard extends StatelessWidget {
  const _ServiceCard({required this.code, required this.selected, required this.onChanged});
  final String code;
  final bool selected;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final def = getService(code)!;
    final a = Tokens.accent(def.accent);
    final b = context.brightness;
    return Semantics(
      checked: selected,
      button: true,
      label: s.t(def.labelKey),
      child: AppCard(
        onTap: () => onChanged(!selected),
        color: selected ? a.background(b).withValues(alpha: 0.6) : null,
        padding: const EdgeInsets.all(Tokens.s3),
        child: Row(children: [
          ServiceAvatar(serviceCode: code),
          const SizedBox(width: Tokens.s3),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.t(def.labelKey), style: Theme.of(context).textTheme.titleSmall),
              Text(s.t(def.descriptionKey), style: TextStyle(color: context.tokens.textMuted, fontSize: Tokens.fontSm)),
            ]),
          ),
          ExcludeSemantics(child: Checkbox(value: selected, onChanged: (v) => onChanged(v ?? false))),
        ]),
      ),
    );
  }
}
