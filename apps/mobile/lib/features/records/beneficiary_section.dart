import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/banks.dart';
import '../../data/api/api_exception.dart';
import '../../data/models/tenant_models.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

/// Detail keys this section owns, in the order an operator reads them off the passbook.
const beneficiaryKeys = ['accountNumber', 'ifsc', 'bankName', 'beneficiaryName'];

final _accountRe = RegExp(r'^\d{9,18}$');
final _ifscRe = RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$');

/// DMT beneficiary: saved beneficiaries of the customer, or account number → IFSC (picks the bank)
/// → bank → holder name with Verify (connected provider only) → Add beneficiary.
class BeneficiarySection extends ConsumerStatefulWidget {
  const BeneficiarySection({
    super.key,
    required this.controllers,
    required this.errors,
    required this.onEdited,
    this.customerId,
    this.canSave = false,
  });

  /// Text controllers of the form for [beneficiaryKeys].
  final Map<String, TextEditingController> controllers;
  final Map<String, String> errors;

  /// Called with a detail key whenever that field changes (the form clears its error).
  final void Function(String key) onEdited;
  final String? customerId;
  final bool canSave;

  @override
  ConsumerState<BeneficiarySection> createState() => _BeneficiarySectionState();
}

class _BeneficiarySectionState extends ConsumerState<BeneficiarySection> {
  String? _selectedId; // saved beneficiary id, or null for "new"
  bool _autoPicked = false;
  bool _verifying = false;
  bool _adding = false;
  String? _verifiedName;
  String? _verifiedFor; // "account|ifsc" the name was verified for
  ({bool ok, String text})? _verifyMsg;

  TextEditingController _c(String k) => widget.controllers[k]!;
  String get _acct => _c('accountNumber').text.replaceAll(RegExp(r'\D'), '');
  String get _ifsc => _c('ifsc').text.toUpperCase();

  @override
  void didUpdateWidget(covariant BeneficiarySection old) {
    super.didUpdateWidget(old);
    if (old.customerId != widget.customerId) {
      _selectedId = null;
      _autoPicked = false;
    }
  }

  void _set(String key, String value) {
    final c = _c(key);
    c.value = TextEditingValue(text: value, selection: TextSelection.collapsed(offset: value.length));
    widget.onEdited(key);
  }

  void _pickSaved(Beneficiary? b) {
    setState(() {
      _selectedId = b?.id;
      _verifyMsg = null;
    });
    _set('accountNumber', b?.accountNumber ?? '');
    _set('ifsc', b?.ifsc ?? '');
    _set('bankName', b?.bankName ?? '');
    _set('beneficiaryName', b?.name ?? '');
  }

  void _onIfscChanged(String _) {
    widget.onEdited('ifsc');
    final b = bankForIfsc(_ifsc);
    final current = _c('bankName').text;
    // Fill the bank from the IFSC unless the operator typed a bank we don't know.
    if (b != null && (current.trim().isEmpty || bankByName(current) != null) && current != b.name) _set('bankName', b.name);
    setState(() {});
  }

  Future<void> _verify() async {
    final s = context.s;
    setState(() {
      _verifying = true;
      _verifyMsg = null;
    });
    try {
      final r = await ref.read(apiProvider).verifyAccount(accountNumber: _acct, ifsc: _ifsc);
      if (!mounted) return;
      if (r.verified && r.name != null) {
        _set('beneficiaryName', r.name!);
        setState(() {
          _verifiedName = r.name;
          _verifiedFor = '$_acct|$_ifsc';
          _verifyMsg = (ok: true, text: s.t('mobile.ben.verifiedMsg'));
        });
      } else {
        setState(() => _verifyMsg = (ok: false, text: r.message ?? s.t('mobile.ben.verifyFailed')));
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _verifyMsg = (ok: false, text: e.isNetwork ? s.t('mobile.ben.verifyFailed') : errorText(context, e)));
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  Future<void> _add() async {
    final s = context.s;
    final id = widget.customerId;
    if (id == null) return;
    setState(() => _adding = true);
    try {
      final b = await ref.read(apiProvider).createBeneficiary(
            id,
            name: _c('beneficiaryName').text,
            bankName: _c('bankName').text,
            accountNumber: _acct,
            ifsc: _ifsc,
          );
      ref.invalidate(beneficiariesProvider(id));
      if (!mounted) return;
      setState(() => _selectedId = b.id);
      showSnack(context, s.t('mobile.ben.added', {'name': b.name}));
    } on ApiException catch (e) {
      if (!mounted) return;
      // Server field names → form keys.
      e.fields.forEach((k, v) {
        if (v.isNotEmpty) widget.errors['details.${k == 'name' ? 'beneficiaryName' : k}'] = v.first;
      });
      showSnack(context, errorText(context, e), error: true);
      setState(() {});
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  Future<void> _openBankPicker() async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => FractionallySizedBox(heightFactor: 0.85, child: BankPickerSheet(current: _c('bankName').text)),
    );
    if (picked != null) {
      _set('bankName', picked);
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final t = context.tokens;
    final customerId = widget.customerId;
    final saved = customerId == null ? const <Beneficiary>[] : (ref.watch(beneficiariesProvider(customerId)).value ?? const <Beneficiary>[]);
    // Default to the most recently used saved beneficiary once, if nothing is typed yet.
    if (!_autoPicked && saved.isNotEmpty) {
      _autoPicked = true;
      if (_c('accountNumber').text.isEmpty && _c('beneficiaryName').text.isEmpty) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _pickSaved(saved.first);
        });
      }
    }
    final showForm = _selectedId == null || !saved.any((b) => b.id == _selectedId);
    final available = ref.watch(accountVerifyAvailableProvider).value ?? false;
    final canVerify = available && _accountRe.hasMatch(_acct) && _ifscRe.hasMatch(_ifsc);
    final isVerified = _verifiedName != null && _verifiedFor == '$_acct|$_ifsc' && _verifiedName == _c('beneficiaryName').text;
    final hint = !available ? s.t('mobile.ben.verifyUnavailable') : (!canVerify ? s.t('mobile.ben.verifyNeedsInput') : null);
    final bank = bankByName(_c('bankName').text);
    final ifscBank = _ifsc.length == 11 ? bankForIfsc(_ifsc) : null;

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(s.t('mobile.ben.title'), style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
      if (saved.isNotEmpty) ...[
        Text(s.t('mobile.ben.pick'), style: TextStyle(color: t.textMuted, fontSize: Tokens.fontXs)),
        const SizedBox(height: Tokens.s2),
        for (final b in saved) ...[
          _BenCard(
            key: Key('ben.${b.id}'),
            selected: _selectedId == b.id,
            onTap: () => _pickSaved(b),
            leading: BankIcon(bank: bankForIfsc(b.ifsc ?? '') ?? bankByName(b.bankName)),
            title: b.name,
            subtitle: '${b.bankName} · ${b.accountNumber}${b.ifsc != null ? '\n${b.ifsc}' : ''}',
          ),
          const SizedBox(height: Tokens.s2),
        ],
        _BenCard(
          key: const Key('ben.new'),
          selected: showForm,
          dashed: true,
          onTap: () => _pickSaved(null),
          leading: Icon(Icons.add_rounded, color: t.brand),
          title: s.t('mobile.ben.new'),
          subtitle: s.t('mobile.ben.newHint'),
          titleColor: t.brand,
        ),
        const SizedBox(height: Tokens.s3),
      ] else
        const SizedBox(height: Tokens.s2),
      if (showForm)
        AppCard(
          padding: const EdgeInsets.all(Tokens.s3),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            TextField(
              key: const Key('field.accountNumber'),
              controller: _c('accountNumber'),
              keyboardType: TextInputType.number,
              maxLength: 18,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              onChanged: (_) => setState(() => widget.onEdited('accountNumber')),
              decoration: InputDecoration(
                labelText: s.t('field.accountNumber'),
                hintText: '50100234567890',
                errorText: widget.errors['details.accountNumber'],
                counterText: '',
              ),
            ),
            const SizedBox(height: Tokens.s3),
            TextField(
              key: const Key('field.ifsc'),
              controller: _c('ifsc'),
              maxLength: 11,
              textCapitalization: TextCapitalization.characters,
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]')), _UpperCaseFormatter()],
              onChanged: _onIfscChanged,
              decoration: InputDecoration(
                labelText: '${s.t('field.ifsc')} (${s.t('common.optional')})',
                hintText: 'SBIN0001234',
                helperText: ifscBank?.name,
                errorText: widget.errors['details.ifsc'],
                counterText: '',
              ),
            ),
            const SizedBox(height: Tokens.s3),
            TextField(
              key: const Key('field.bankName'),
              controller: _c('bankName'),
              maxLength: 80,
              onChanged: (_) => setState(() => widget.onEdited('bankName')),
              decoration: InputDecoration(
                labelText: s.t('field.bankName'),
                hintText: s.t('mobile.ben.selectBank'),
                errorText: widget.errors['details.bankName'],
                counterText: '',
                prefixIcon: Padding(padding: const EdgeInsets.all(8), child: BankIcon(bank: bank, size: 30)),
                suffixIcon: IconButton(
                  key: const Key('ben.pickBank'),
                  tooltip: s.t('mobile.ben.selectBank'),
                  onPressed: _openBankPicker,
                  icon: const Icon(Icons.unfold_more_rounded),
                ),
              ),
            ),
            const SizedBox(height: Tokens.s3),
            TextField(
              key: const Key('field.beneficiaryName'),
              controller: _c('beneficiaryName'),
              maxLength: 80,
              onChanged: (_) => setState(() => widget.onEdited('beneficiaryName')),
              decoration: InputDecoration(
                labelText: s.t('field.beneficiaryName'),
                hintText: s.t('mobile.ben.namePlaceholder'),
                errorText: widget.errors['details.beneficiaryName'],
                helperText: _verifyMsg?.text ?? hint,
                helperMaxLines: 3,
                helperStyle: _verifyMsg == null ? null : TextStyle(color: _verifyMsg!.ok ? t.success : t.danger),
                counterText: '',
                enabledBorder: isVerified ? OutlineInputBorder(borderSide: BorderSide(color: t.success), borderRadius: BorderRadius.circular(Tokens.radiusMd)) : null,
                suffixIcon: Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: TextButton.icon(
                    key: const Key('ben.verify'),
                    style: TextButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                      foregroundColor: isVerified ? t.success : t.brand,
                      backgroundColor: (isVerified ? t.success : t.brand).withValues(alpha: 0.1),
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      minimumSize: const Size(0, 32),
                    ),
                    onPressed: canVerify && !_verifying ? _verify : null,
                    icon: _verifying
                        ? const SizedBox.square(dimension: 14, child: CircularProgressIndicator(strokeWidth: 2))
                        : Icon(isVerified ? Icons.verified_rounded : Icons.shield_outlined, size: 16),
                    label: Text(isVerified ? s.t('mobile.ben.verified') : s.t('mobile.ben.verify'), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                  ),
                ),
                suffixIconConstraints: const BoxConstraints(minHeight: 32),
              ),
            ),
            if (customerId != null && widget.canSave) ...[
              const SizedBox(height: Tokens.s3),
              FilledButton.icon(
                key: const Key('ben.add'),
                onPressed: _adding ? null : _add,
                icon: _adding ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.person_add_alt_1_rounded),
                label: Text(s.t('mobile.ben.add')),
              ),
            ],
          ]),
        ),
    ]);
  }
}

class _BenCard extends StatelessWidget {
  const _BenCard({
    super.key,
    required this.selected,
    required this.onTap,
    required this.leading,
    required this.title,
    required this.subtitle,
    this.dashed = false,
    this.titleColor,
  });
  final bool selected;
  final VoidCallback onTap;
  final Widget leading;
  final String title;
  final String subtitle;
  final bool dashed;
  final Color? titleColor;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected ? t.brand.withValues(alpha: 0.08) : t.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Tokens.radiusLg),
          side: BorderSide(color: selected ? t.brand : t.border, width: selected ? 1.5 : 1),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(Tokens.radiusLg),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(Tokens.s3),
            child: Row(children: [
              SizedBox(width: 36, child: Center(child: leading)),
              const SizedBox(width: Tokens.s3),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: TextStyle(fontWeight: FontWeight.w700, color: titleColor)),
                  Text(subtitle, style: TextStyle(color: t.textMuted, fontSize: Tokens.fontXs)),
                ]),
              ),
              if (selected) Icon(Icons.check_circle_rounded, color: t.brand),
            ]),
          ),
        ),
      ),
    );
  }
}

class BankPickerSheet extends StatefulWidget {
  const BankPickerSheet({super.key, required this.current});
  final String current;

  @override
  State<BankPickerSheet> createState() => BankPickerSheetState();
}

class BankPickerSheetState extends State<BankPickerSheet> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final t = context.tokens;
    final q = _q.trim().toLowerCase();
    final list = q.isEmpty
        ? banks
        : banks.where((b) => b.name.toLowerCase().contains(q) || b.short.toLowerCase().contains(q) || b.code.toLowerCase().startsWith(q)).toList();
    final selected = bankByName(widget.current);
    final typed = _q.trim();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(Tokens.s4, 0, Tokens.s4, Tokens.s2),
        child: TextField(
          key: const Key('ben.bankSearch'),
          autofocus: true,
          onChanged: (v) => setState(() => _q = v),
          decoration: InputDecoration(prefixIcon: const Icon(Icons.search_rounded), hintText: s.t('mobile.ben.searchBank')),
        ),
      ),
      Expanded(
        child: ListView(padding: const EdgeInsets.fromLTRB(Tokens.s4, 0, Tokens.s4, Tokens.s4), children: [
          if (q.isEmpty) ...[
            Padding(
              padding: const EdgeInsets.symmetric(vertical: Tokens.s2),
              child: Text(s.t('mobile.ben.popular'), style: TextStyle(fontWeight: FontWeight.w700, color: t.textMuted, fontSize: Tokens.fontXs)),
            ),
            GridView.count(
              crossAxisCount: 4,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 0.95,
              children: [
                for (final b in banks.where((b) => b.popular).take(8))
                  InkWell(
                    borderRadius: BorderRadius.circular(Tokens.radiusMd),
                    onTap: () => Navigator.pop(context, b.name),
                    child: Container(
                      decoration: BoxDecoration(
                        color: selected?.code == b.code ? t.brand.withValues(alpha: 0.1) : null,
                        borderRadius: BorderRadius.circular(Tokens.radiusMd),
                      ),
                      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        BankIcon(bank: b, size: 42),
                        const SizedBox(height: 4),
                        Text(b.short, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                      ]),
                    ),
                  ),
              ],
            ),
            const Divider(),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: Tokens.s2),
              child: Text(s.t('mobile.ben.allBanks'), style: TextStyle(fontWeight: FontWeight.w700, color: t.textMuted, fontSize: Tokens.fontXs)),
            ),
          ],
          for (final b in list)
            ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 4),
              leading: BankIcon(bank: b, size: 32),
              title: Text(b.name),
              subtitle: Text(b.code, style: TextStyle(color: t.textMuted, fontSize: 11)),
              trailing: selected?.code == b.code ? Icon(Icons.check_rounded, color: t.brand) : null,
              onTap: () => Navigator.pop(context, b.name),
            ),
          if (typed.length >= 3 && !list.any((b) => b.name.toLowerCase() == typed.toLowerCase()))
            ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 4),
              leading: const BankIcon(size: 32),
              title: Text(s.t('mobile.ben.useBank', {'name': typed}), style: TextStyle(color: t.brand, fontWeight: FontWeight.w700)),
              onTap: () => Navigator.pop(context, typed),
            ),
          if (list.isEmpty && typed.length < 3)
            Padding(padding: const EdgeInsets.all(Tokens.s6), child: Text(s.t('mobile.ben.noBank'), textAlign: TextAlign.center)),
        ]),
      ),
    ]);
  }
}

class _UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) =>
      newValue.copyWith(text: newValue.text.toUpperCase());
}
