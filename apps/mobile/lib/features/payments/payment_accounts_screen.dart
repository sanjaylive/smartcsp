import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/banks.dart';
import '../../core/status.dart';
import '../../core/upi.dart';
import '../../data/api/api_exception.dart';
import '../../data/models/payment_models.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';
import '../records/beneficiary_section.dart' show BankPickerSheet;
import 'payment_widgets.dart';

/// Settings → Payment accounts: the shop's UPI IDs / QR photos and bank accounts.
class PaymentAccountsScreen extends ConsumerWidget {
  const PaymentAccountsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final manage = ref.watch(tenantContextProvider).value?.can('settings.manage') ?? false;
    return Scaffold(
      appBar: AppBar(title: Text(s.t('nav.payments'))),
      body: AsyncView(
        value: ref.watch(paymentAccountsProvider),
        onRetry: () => ref.invalidate(paymentAccountsProvider),
        builder: (items) {
          final upi = items.where((a) => a.isUpi).toList();
          final bank = items.where((a) => !a.isUpi).toList();
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(paymentAccountsProvider),
            child: ListView(padding: const EdgeInsets.all(Tokens.s4), children: [
              Text(s.t('mobile.pay.help'), style: TextStyle(color: context.tokens.textMuted)),
              _Header(
                icon: Icons.qr_code_2_rounded,
                title: s.t('mobile.pay.upiTitle'),
                onAdd: manage ? () => _openForm(context, 'UPI') : null,
                addKey: const Key('pay.addUpi'),
              ),
              if (upi.isEmpty) _Empty(text: s.t('mobile.pay.noUpi')),
              for (final a in upi) _AccountTile(account: a, manage: manage),
              _Header(
                icon: Icons.account_balance_outlined,
                title: s.t('mobile.pay.bankTitle'),
                onAdd: manage ? () => _openForm(context, 'BANK') : null,
                addKey: const Key('pay.addBank'),
              ),
              if (bank.isEmpty) _Empty(text: s.t('mobile.pay.noBank')),
              for (final a in bank) _AccountTile(account: a, manage: manage),
              const SizedBox(height: Tokens.s6),
            ]),
          );
        },
      ),
    );
  }
}

Future<void> _openForm(BuildContext context, String kind, {PaymentAccount? account}) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: FractionallySizedBox(heightFactor: 0.92, child: _AccountForm(kind: kind, account: account)),
      ),
    );

class _Header extends StatelessWidget {
  const _Header({required this.icon, required this.title, this.onAdd, this.addKey});
  final IconData icon;
  final String title;
  final VoidCallback? onAdd;
  final Key? addKey;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: Tokens.s5, bottom: Tokens.s2),
        child: Row(children: [
          Icon(icon, color: context.tokens.brand),
          const SizedBox(width: Tokens.s2),
          Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
          if (onAdd != null) FilledButton.tonalIcon(key: addKey, onPressed: onAdd, icon: const Icon(Icons.add_rounded), label: Text(context.s.t('mobile.pay.add'))),
        ]),
      );
}

class _Empty extends StatelessWidget {
  const _Empty({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => AppCard(color: context.tokens.surfaceMuted, child: Text(text, style: TextStyle(color: context.tokens.textMuted)));
}

class _AccountTile extends ConsumerWidget {
  const _AccountTile({required this.account, required this.manage});
  final PaymentAccount account;
  final bool manage;

  Future<void> _run(BuildContext context, WidgetRef ref, Future<void> Function() action, [String? done]) async {
    try {
      await action();
      ref.invalidate(paymentAccountsProvider);
      if (context.mounted && done != null) showSnack(context, done);
    } on ApiException catch (e) {
      if (context.mounted) showSnack(context, errorText(context, e), error: true);
    }
  }

  Future<void> _uploadQr(BuildContext context, WidgetRef ref) async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1600, imageQuality: 90);
    if (file == null || !context.mounted) return;
    final bytes = await file.readAsBytes();
    if (!context.mounted) return;
    await _run(context, ref, () => ref.read(apiProvider).uploadPaymentQr(account.id, bytes, file.name), context.s.t('mobile.pay.qrUploaded'));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final t = context.tokens;
    final a = account;
    final api = ref.read(apiProvider);
    return Padding(
      padding: const EdgeInsets.only(bottom: Tokens.s2),
      child: Opacity(
        opacity: a.active ? 1 : 0.55,
        child: AppCard(
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (a.isUpi)
              a.qrAttachmentId != null
                  ? UploadedQrImage(attachmentId: a.qrAttachmentId!, size: 64)
                  : a.upiId != null
                      ? UpiQrCode(data: upiPaymentUri(upiId: a.upiId!, payeeName: a.payeeName), size: 64)
                      : const SizedBox(width: 76)
            else
              BankIcon(bank: bankForIfsc(a.ifsc ?? '') ?? bankByName(a.bankName ?? ''), size: 44),
            const SizedBox(width: Tokens.s3),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  Text(a.label, style: const TextStyle(fontWeight: FontWeight.w700)),
                  if (a.isDefault) StatusChip(label: s.t('mobile.pay.default'), tone: StatusTone.success, dense: true),
                  if (!a.active) StatusChip(label: s.t('mobile.pay.off'), tone: StatusTone.neutral, dense: true),
                ]),
                const SizedBox(height: 2),
                if (a.isUpi) ...[
                  Row(children: [UpiAppDot(app: a.upiApp), const SizedBox(width: 6), Text(upiAppLabels[a.upiApp ?? 'OTHER'] ?? 'UPI')]),
                  Text(a.upiId ?? s.t('mobile.pay.qrOnly'), style: TextStyle(color: t.textMuted, fontFeatures: moneyFeatures)),
                ] else ...[
                  Text(a.bankName ?? '', style: const TextStyle(fontWeight: FontWeight.w500)),
                  Text('${maskAccount(a.accountNumber)} · ${a.ifsc ?? ''}', style: TextStyle(color: t.textMuted, fontFeatures: moneyFeatures)),
                  Text(a.holderName ?? '', style: TextStyle(color: t.textMuted, fontSize: 12)),
                ],
              ]),
            ),
            if (manage)
              PopupMenuButton<String>(
                tooltip: s.t('mobile.pay.actions'),
                onSelected: (v) async {
                  switch (v) {
                    case 'edit':
                      await _openForm(context, a.kind, account: a);
                    case 'qr':
                      await _uploadQr(context, ref);
                    case 'default':
                      await _run(context, ref, () => api.updatePaymentAccount(a.id, a.version, {'isDefault': true}));
                    case 'toggle':
                      await _run(context, ref, () => api.updatePaymentAccount(a.id, a.version, {'active': !a.active}));
                    case 'delete':
                      final ok = await showDialog<bool>(
                        context: context,
                        builder: (d) => AlertDialog(
                          title: Text(s.t('mobile.pay.deleteTitle', {'name': a.label})),
                          content: Text(s.t('mobile.pay.deleteBody')),
                          actions: [
                            TextButton(onPressed: () => Navigator.pop(d, false), child: Text(s.t('common.cancel'))),
                            FilledButton(onPressed: () => Navigator.pop(d, true), child: Text(s.t('mobile.common.delete'))),
                          ],
                        ),
                      );
                      if (ok == true && context.mounted) {
                        await _run(context, ref, () async {
                          final deleted = await api.deletePaymentAccount(a.id);
                          if (context.mounted) showSnack(context, s.t(deleted ? 'mobile.pay.deleted' : 'mobile.pay.switchedOff'));
                        });
                      }
                  }
                },
                itemBuilder: (_) => [
                  PopupMenuItem(value: 'edit', child: Text(s.t('mobile.pay.edit'))),
                  if (a.isUpi) PopupMenuItem(value: 'qr', child: Text(s.t(a.qrAttachmentId == null ? 'mobile.pay.uploadQr' : 'mobile.pay.replaceQr'))),
                  if (a.active && !a.isDefault) PopupMenuItem(value: 'default', child: Text(s.t('mobile.pay.makeDefault'))),
                  PopupMenuItem(value: 'toggle', child: Text(s.t(a.active ? 'mobile.pay.switchOff' : 'mobile.pay.switchOn'))),
                  PopupMenuItem(value: 'delete', child: Text(s.t('mobile.common.delete'), style: TextStyle(color: t.danger))),
                ],
              ),
          ]),
        ),
      ),
    );
  }
}

/// Add / edit sheet for a UPI or bank account.
class _AccountForm extends ConsumerStatefulWidget {
  const _AccountForm({required this.kind, this.account});
  final String kind;
  final PaymentAccount? account;

  @override
  ConsumerState<_AccountForm> createState() => _AccountFormState();
}

class _AccountFormState extends ConsumerState<_AccountForm> {
  late final a = widget.account;
  late final _label = TextEditingController(text: a?.label ?? '');
  late final _upiId = TextEditingController(text: a?.upiId ?? '');
  late final _payee = TextEditingController(text: a?.payeeName ?? '');
  late final _holder = TextEditingController(text: a?.holderName ?? '');
  late final _account = TextEditingController(text: a?.accountNumber ?? '');
  late final _ifsc = TextEditingController(text: a?.ifsc ?? '');
  late String _bankName = a?.bankName ?? '';
  late String _upiApp = a?.upiApp ?? 'PHONEPE';
  late String _accountType = a?.accountType ?? 'CURRENT';
  late bool _isDefault = a?.isDefault ?? false;
  XFile? _qr;
  Map<String, String> _errors = {};
  bool _busy = false;
  bool _verifying = false;
  String? _verified;

  bool get _upi => widget.kind == 'UPI';

  @override
  void dispose() {
    for (final c in [_label, _upiId, _payee, _holder, _account, _ifsc]) {
      c.dispose();
    }
    super.dispose();
  }

  Map<String, String> _validate(AppStrings s) {
    final e = <String, String>{};
    if (_upi) {
      final id = _upiId.text.trim().toLowerCase();
      if (id.isEmpty && _qr == null && a?.qrAttachmentId == null) e['upiId'] = s.t('mobile.pay.needUpiOrQr');
      if (id.isNotEmpty && !upiIdPattern.hasMatch(id)) e['upiId'] = s.t('mobile.pay.badUpi');
    } else {
      if (_label.text.trim().length < 2) e['label'] = s.t('common.required');
      if (_bankName.trim().isEmpty) e['bankName'] = s.t('common.required');
      if (!RegExp(r'^\d{9,18}$').hasMatch(_account.text.replaceAll(RegExp(r'[\s-]'), ''))) e['accountNumber'] = s.t('mobile.pay.badAccount');
      if (!RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$').hasMatch(_ifsc.text.trim().toUpperCase())) e['ifsc'] = s.t('mobile.pay.badIfsc');
      if (_holder.text.trim().length < 2) e['holderName'] = s.t('common.required');
    }
    return e;
  }

  Future<void> _save() async {
    final s = context.s;
    final errors = _validate(s);
    setState(() => _errors = errors);
    if (errors.isNotEmpty) return;
    final api = ref.read(apiProvider);
    final body = _upi
        ? {
            'label': _label.text.trim().isEmpty ? (upiAppLabels[_upiApp] ?? 'UPI') : _label.text.trim(),
            'upiId': _upiId.text.trim().isEmpty ? null : _upiId.text.trim().toLowerCase(),
            'payeeName': _payee.text.trim().isEmpty ? null : _payee.text.trim(),
            'upiApp': _upiApp,
            'isDefault': _isDefault,
          }
        : {
            'label': _label.text.trim(),
            'holderName': _holder.text.trim(),
            'bankName': _bankName.trim(),
            'accountNumber': _account.text.replaceAll(RegExp(r'[\s-]'), ''),
            'ifsc': _ifsc.text.trim().toUpperCase(),
            'accountType': _accountType,
            'isDefault': _isDefault,
          };
    setState(() => _busy = true);
    try {
      final saved = a == null ? await api.createPaymentAccount({'kind': widget.kind, ...body}) : await api.updatePaymentAccount(a!.id, a!.version, body);
      if (_qr != null) await api.uploadPaymentQr(saved.id, await _qr!.readAsBytes(), _qr!.name);
      ref.invalidate(paymentAccountsProvider);
      if (!mounted) return;
      showSnack(context, s.t('mobile.pay.saved', {'name': saved.label}));
      Navigator.pop(context);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _errors = {for (final f in e.fields.entries) if (f.value.isNotEmpty) f.key: f.value.first});
      if (e.fields.isEmpty) showSnack(context, errorText(context, e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    setState(() {
      _verifying = true;
      _verified = null;
    });
    try {
      final r = await ref.read(apiProvider).verifyAccount(accountNumber: _account.text.replaceAll(RegExp(r'\D'), ''), ifsc: _ifsc.text.trim());
      if (!mounted) return;
      if (r.verified && r.name != null) {
        setState(() => _verified = r.name);
        if (_holder.text.trim().isEmpty) _holder.text = r.name!;
      } else {
        showSnack(context, r.message ?? context.s.t('mobile.pay.notFound'), error: true);
      }
    } on ApiException catch (e) {
      if (mounted) showSnack(context, errorText(context, e), error: true);
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  Future<void> _pickBank() async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => FractionallySizedBox(heightFactor: 0.85, child: BankPickerSheet(current: _bankName)),
    );
    if (picked != null) setState(() => _bankName = picked);
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final t = context.tokens;
    final verifyAvailable = ref.watch(accountVerifyAvailableProvider).value ?? false;
    final previewId = _upiId.text.trim().toLowerCase();
    return Column(children: [
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: Tokens.s4),
        child: Row(children: [
          Expanded(
            child: Text(s.t(a == null ? (_upi ? 'mobile.pay.addUpiTitle' : 'mobile.pay.addBankTitle') : 'mobile.pay.editTitle'),
                style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          ),
        ]),
      ),
      Expanded(
        child: ListView(padding: const EdgeInsets.all(Tokens.s4), children: [
          if (_upi) ...[
            Text(s.t('mobile.pay.upiApp'), style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: Tokens.s2),
            Wrap(spacing: Tokens.s2, runSpacing: Tokens.s2, children: [
              for (final app in upiApps)
                ChoiceChip(
                  selected: _upiApp == app,
                  avatar: UpiAppDot(app: app),
                  label: Text(app == 'OTHER' ? s.t('mobile.pay.otherApp') : upiAppLabels[app]!),
                  onSelected: (_) => setState(() => _upiApp = app),
                ),
            ]),
            const SizedBox(height: Tokens.s4),
            TextField(
              key: const Key('pay.upiId'),
              controller: _upiId,
              autocorrect: false,
              keyboardType: TextInputType.emailAddress,
              onChanged: (_) => setState(() => _errors.remove('upiId')),
              decoration: InputDecoration(labelText: s.t('mobile.pay.upiId'), hintText: 'myshop@ybl', helperText: s.t('mobile.pay.upiIdHelp'), errorText: _errors['upiId']),
            ),
            const SizedBox(height: Tokens.s3),
            TextField(controller: _payee, decoration: InputDecoration(labelText: '${s.t('mobile.pay.payeeName')} (${s.t('common.optional')})')),
            const SizedBox(height: Tokens.s3),
            TextField(
              controller: _label,
              decoration: InputDecoration(labelText: s.t('mobile.pay.nickname'), hintText: upiAppLabels[_upiApp], errorText: _errors['label']),
            ),
            const SizedBox(height: Tokens.s4),
            AppCard(
              color: t.surfaceMuted,
              child: Row(children: [
                if (_qr != null)
                  const Icon(Icons.image_rounded, size: 56)
                else if (a?.qrAttachmentId != null)
                  UploadedQrImage(attachmentId: a!.qrAttachmentId!, size: 64)
                else if (upiIdPattern.hasMatch(previewId))
                  UpiQrCode(data: upiPaymentUri(upiId: previewId, payeeName: _payee.text), size: 64)
                else
                  Icon(Icons.qr_code_2_rounded, size: 56, color: t.textMuted),
                const SizedBox(width: Tokens.s3),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(s.t('mobile.pay.qrPhoto'), style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text(_qr?.name ?? s.t('mobile.pay.qrPhotoHelp'), style: TextStyle(color: t.textMuted, fontSize: 12)),
                    TextButton.icon(
                      onPressed: () async {
                        final f = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1600, imageQuality: 90);
                        if (f != null) setState(() => _qr = f);
                      },
                      icon: const Icon(Icons.image_outlined),
                      label: Text(s.t(a?.qrAttachmentId != null || _qr != null ? 'mobile.pay.replaceQr' : 'mobile.pay.chooseImage')),
                    ),
                  ]),
                ),
              ]),
            ),
          ] else ...[
            InkWell(
              onTap: _pickBank,
              borderRadius: BorderRadius.circular(Tokens.radiusMd),
              child: InputDecorator(
                decoration: InputDecoration(labelText: s.t('field.bankName'), errorText: _errors['bankName'], suffixIcon: const Icon(Icons.unfold_more_rounded)),
                child: Row(children: [
                  BankIcon(bank: bankByName(_bankName), size: 24),
                  const SizedBox(width: Tokens.s2),
                  Expanded(child: Text(_bankName.isEmpty ? s.t('mobile.common.select') : _bankName)),
                ]),
              ),
            ),
            const SizedBox(height: Tokens.s3),
            TextField(
              key: const Key('pay.accountNumber'),
              controller: _account,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(18)],
              onChanged: (_) => setState(() => _verified = null),
              decoration: InputDecoration(labelText: s.t('field.accountNumber'), errorText: _errors['accountNumber']),
            ),
            const SizedBox(height: Tokens.s3),
            TextField(
              controller: _ifsc,
              textCapitalization: TextCapitalization.characters,
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]')), LengthLimitingTextInputFormatter(11)],
              onChanged: (v) {
                final b = bankForIfsc(v.toUpperCase());
                setState(() {
                  _verified = null;
                  if (b != null && _bankName.isEmpty) _bankName = b.name;
                });
              },
              decoration: InputDecoration(labelText: s.t('field.ifsc'), hintText: 'SBIN0001234', errorText: _errors['ifsc']),
            ),
            const SizedBox(height: Tokens.s3),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: TextField(
                  controller: _holder,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    labelText: s.t('mobile.pay.holder'),
                    errorText: _errors['holderName'],
                    helperText: _verified == null ? null : s.t('mobile.pay.verified', {'name': _verified!}),
                  ),
                ),
              ),
              if (verifyAvailable) ...[
                const SizedBox(width: Tokens.s2),
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: OutlinedButton(onPressed: _verifying ? null : _verify, child: _verifying ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Text(s.t('mobile.pay.verify'))),
                ),
              ],
            ]),
            const SizedBox(height: Tokens.s3),
            SegmentedButton<String>(
              segments: [
                ButtonSegment(value: 'CURRENT', label: Text(s.t('mobile.pay.current'))),
                ButtonSegment(value: 'SAVINGS', label: Text(s.t('mobile.pay.savings'))),
              ],
              selected: {_accountType},
              onSelectionChanged: (v) => setState(() => _accountType = v.first),
            ),
            const SizedBox(height: Tokens.s3),
            TextField(
              key: const Key('pay.label'),
              controller: _label,
              decoration: InputDecoration(labelText: s.t('mobile.pay.nickname'), hintText: s.t('mobile.pay.nicknameBankHint'), errorText: _errors['label']),
            ),
          ],
          const SizedBox(height: Tokens.s3),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _isDefault,
            onChanged: (v) => setState(() => _isDefault = v),
            title: Text(s.t('mobile.pay.useDefault')),
            subtitle: Text(s.t(_upi ? 'mobile.pay.useDefaultUpi' : 'mobile.pay.useDefaultBank')),
          ),
        ]),
      ),
      SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(Tokens.s4),
          child: FilledButton(
            key: const Key('pay.save'),
            onPressed: _busy ? null : _save,
            child: _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : Text(s.t('common.save')),
          ),
        ),
      ),
    ]);
  }
}
