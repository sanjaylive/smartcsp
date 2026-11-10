import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/banks.dart';
import '../../core/upi.dart';
import '../../data/models/payment_models.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

String maskAccount(String? n) => n == null || n.length < 4 ? (n ?? '') : '••••${n.substring(n.length - 4)}';

class UpiAppDot extends StatelessWidget {
  const UpiAppDot({super.key, this.app, this.size = 10});
  final String? app;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: Color(upiAppColors[app ?? 'OTHER'] ?? upiAppColors['OTHER']!), shape: BoxShape.circle),
      );
}

/// Copy-to-clipboard text button.
class CopyChip extends StatelessWidget {
  const CopyChip({super.key, required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => TextButton.icon(
        style: TextButton.styleFrom(visualDensity: VisualDensity.compact, padding: const EdgeInsets.symmetric(horizontal: 8)),
        onPressed: () async {
          await Clipboard.setData(ClipboardData(text: text));
          if (context.mounted) showSnack(context, context.s.t('mobile.pay.copied'));
        },
        icon: const Icon(Icons.copy_rounded, size: 16),
        label: Text(context.s.t('mobile.pay.copy')),
      );
}

/// QR code for a upi://pay link, drawn on the device.
class UpiQrCode extends StatelessWidget {
  const UpiQrCode({super.key, required this.data, this.size = 176});
  final String data;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(Tokens.radiusMd), border: Border.all(color: context.tokens.border)),
        child: QrImageView(data: data, size: size, padding: EdgeInsets.zero, backgroundColor: Colors.white, semanticsLabel: context.s.t('mobile.pay.qrLabel')),
      );
}

/// The shop's uploaded QR photo (static: the customer types the amount).
class UploadedQrImage extends ConsumerWidget {
  const UploadedQrImage({super.key, required this.attachmentId, this.size = 176});
  final String attachmentId;
  final double size;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = ref.watch(attachmentUrlProvider(attachmentId));
    return Container(
      width: size + 12,
      height: size + 12,
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(Tokens.radiusMd), border: Border.all(color: context.tokens.border)),
      alignment: Alignment.center,
      child: url.when(
        data: (u) => Image.network(u, fit: BoxFit.contain, semanticLabel: context.s.t('mobile.pay.qrLabel')),
        loading: () => const CircularProgressIndicator(strokeWidth: 2),
        error: (_, _) => Text(context.s.t('mobile.pay.qrUnavailable'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.black54, fontSize: 12)),
      ),
    );
  }
}

/// Receiving-account panel under "Collected via" on a new record.
class CollectPanel extends ConsumerStatefulWidget {
  const CollectPanel({super.key, required this.method, required this.amountPaise, required this.accountId, required this.onAccount, this.note, this.canManage = false});

  /// UPI | BANK
  final String method;
  final int amountPaise;
  final String? accountId;
  final ValueChanged<String?> onAccount;
  final String? note;
  final bool canManage;

  @override
  ConsumerState<CollectPanel> createState() => _CollectPanelState();
}

class _CollectPanelState extends ConsumerState<CollectPanel> {
  bool _showPhoto = false;

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final t = context.tokens;
    final value = ref.watch(paymentAccountsProvider);
    final list = (value.value ?? const <PaymentAccount>[]).where((a) => a.active && a.kind == widget.method).toList();
    PaymentAccount? current;
    for (final a in list) {
      if (a.id == widget.accountId) current = a;
    }
    // Keep the selection valid: default account first, else the first one.
    if (value.hasValue && current == null) {
      final next = list.where((a) => a.isDefault).firstOrNull ?? list.firstOrNull;
      if (next?.id != widget.accountId) WidgetsBinding.instance.addPostFrameCallback((_) => widget.onAccount(next?.id));
    }
    if (value.isLoading) return const Padding(padding: EdgeInsets.all(Tokens.s4), child: Center(child: CircularProgressIndicator(strokeWidth: 2)));

    if (list.isEmpty) {
      return AppCard(
        color: t.surfaceMuted,
        child: Row(children: [
          Icon(widget.method == 'UPI' ? Icons.qr_code_2_rounded : Icons.account_balance_outlined, color: t.textMuted),
          const SizedBox(width: Tokens.s3),
          Expanded(child: Text(s.t(widget.method == 'UPI' ? 'mobile.pay.noUpi' : 'mobile.pay.noBank'), style: TextStyle(color: t.textMuted))),
          if (widget.canManage) TextButton(onPressed: () => context.push('/settings/payments'), child: Text(s.t('mobile.pay.add'))),
        ]),
      );
    }

    final a = current ?? list.first;
    return AppCard(
      key: const Key('record.collectPanel'),
      color: t.surfaceMuted,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (list.length > 1) ...[
          Wrap(spacing: Tokens.s2, runSpacing: Tokens.s2, children: [
            for (final x in list)
              ChoiceChip(
                selected: x.id == a.id,
                avatar: x.isUpi ? UpiAppDot(app: x.upiApp) : BankIcon(bank: bankForIfsc(x.ifsc ?? '') ?? bankByName(x.bankName ?? ''), size: 20),
                label: Text(x.label),
                onSelected: (_) => widget.onAccount(x.id),
              ),
          ]),
          const SizedBox(height: Tokens.s3),
        ],
        if (a.isUpi) _upi(context, a) else _bank(context, a),
      ]),
    );
  }

  Widget _upi(BuildContext context, PaymentAccount a) {
    final s = context.s;
    final t = context.tokens;
    final photo = a.qrAttachmentId != null && (_showPhoto || a.upiId == null);
    final uri = a.upiId == null ? null : upiPaymentUri(upiId: a.upiId!, payeeName: a.payeeName ?? a.label, amountPaise: widget.amountPaise, note: widget.note);
    return Column(children: [
      Center(
        child: photo
            ? UploadedQrImage(attachmentId: a.qrAttachmentId!)
            : uri != null
                ? UpiQrCode(data: uri)
                : const SizedBox.shrink(),
      ),
      const SizedBox(height: Tokens.s3),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        UpiAppDot(app: a.upiApp),
        const SizedBox(width: 6),
        Flexible(child: Text(a.label, style: const TextStyle(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis)),
      ]),
      if (a.upiId != null)
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Flexible(child: Text(a.upiId!, style: const TextStyle(fontFeatures: moneyFeatures), overflow: TextOverflow.ellipsis)),
          CopyChip(text: a.upiId!),
        ]),
      MoneyText(widget.amountPaise, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
      const SizedBox(height: Tokens.s1),
      Text(s.t(photo ? 'mobile.pay.scanPhoto' : 'mobile.pay.scanAmount'), textAlign: TextAlign.center, style: TextStyle(color: t.textMuted, fontSize: 13)),
      if (a.upiId != null && a.qrAttachmentId != null)
        TextButton(onPressed: () => setState(() => _showPhoto = !_showPhoto), child: Text(s.t(_showPhoto ? 'mobile.pay.showAmountQr' : 'mobile.pay.showPhotoQr'))),
      const SizedBox(height: Tokens.s1),
      Text(s.t('mobile.pay.checkApp'), textAlign: TextAlign.center, style: TextStyle(color: t.warning, fontSize: 12, fontWeight: FontWeight.w600)),
    ]);
  }

  Widget _bank(BuildContext context, PaymentAccount a) {
    final s = context.s;
    final t = context.tokens;
    Widget row(String k, String v, {bool copy = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(children: [
            Expanded(flex: 4, child: Text(k, style: TextStyle(color: t.textMuted))),
            Expanded(flex: 6, child: Text(v, textAlign: TextAlign.right, style: TextStyle(fontWeight: FontWeight.w600, fontFeatures: copy ? moneyFeatures : null))),
            if (copy) CopyChip(text: v) else const SizedBox(width: 4),
          ]),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        BankIcon(bank: bankForIfsc(a.ifsc ?? '') ?? bankByName(a.bankName ?? '')),
        const SizedBox(width: Tokens.s3),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(a.label, style: const TextStyle(fontWeight: FontWeight.w700)),
            Row(children: [
              Text('${s.t('mobile.pay.transfer')} ', style: TextStyle(color: t.textMuted, fontSize: 13)),
              MoneyText(widget.amountPaise, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            ]),
          ]),
        ),
      ]),
      const SizedBox(height: Tokens.s2),
      row(s.t('mobile.pay.holder'), a.holderName ?? ''),
      row(s.t('field.accountNumber'), a.accountNumber ?? '', copy: true),
      row(s.t('field.ifsc'), a.ifsc ?? '', copy: true),
      row(s.t('field.bankName'), a.bankName ?? ''),
    ]);
  }
}

/// "PhonePe counter · shop@ybl" — which of the shop's accounts a payment went into.
class PaidIntoText extends ConsumerWidget {
  const PaidIntoText({super.key, required this.accountId});
  final String accountId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    PaymentAccount? a;
    for (final x in ref.watch(paymentAccountsProvider).value ?? const <PaymentAccount>[]) {
      if (x.id == accountId) a = x;
    }
    if (a == null) return const Text('—');
    return Text(
      a.isUpi ? '${a.label} · ${a.upiId ?? 'QR'}' : '${a.label} · ${maskAccount(a.accountNumber)}',
      textAlign: TextAlign.right,
      style: const TextStyle(fontWeight: FontWeight.w500),
    );
  }
}
