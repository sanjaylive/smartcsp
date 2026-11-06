import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/money.dart';
import '../core/registry/services.dart';
import '../core/status.dart';
import '../data/api/api_exception.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../theme/tokens.dart';

/// Localised, user-facing message for any error.
String errorText(BuildContext context, Object error) {
  final s = context.s;
  if (error is ApiException) {
    if (error.code == 'NETWORK') return s.t('mobile.error.offline');
    if (error.code == 'TIMEOUT') return s.t('mobile.error.timeout');
    if (error.code == 'QUOTA_EXCEEDED' || error.code == 'VALIDATION_FAILED' && error.fields.isEmpty) {
      // Server messages for these carry useful specifics (limit reached, plan name).
      return '${s.t(error.messageKey)} ${error.message}'.trim();
    }
    if (s.has(error.messageKey)) return s.t(error.messageKey);
    return error.message;
  }
  return s.t('common.error');
}

void showSnack(BuildContext context, String message, {bool error = false}) {
  final t = context.tokens;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: error ? t.danger : null,
    ));
}

class MoneyText extends StatelessWidget {
  const MoneyText(this.paise, {super.key, this.style, this.signed = false, this.color});
  final int paise;
  final TextStyle? style;
  final bool signed;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final base = style ?? Theme.of(context).textTheme.bodyLarge;
    return Text(
      formatInr(paise, signed: signed),
      style: base?.copyWith(fontFeatures: moneyFeatures, color: color ?? base.color),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(Tokens.s1, Tokens.s5, Tokens.s1, Tokens.s2),
        child: Row(children: [
          Expanded(child: Semantics(header: true, child: Text(text, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700, fontSize: Tokens.fontLg)))),
          ?trailing,
        ]),
      );
}

class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding = const EdgeInsets.all(Tokens.s4), this.onTap, this.color});
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Container(
      decoration: BoxDecoration(
        color: color ?? t.surface,
        borderRadius: BorderRadius.circular(Tokens.radiusLg),
        border: Border.all(color: t.border),
        boxShadow: context.brightness == Brightness.light ? Tokens.cardShadow : null,
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(Tokens.radiusLg),
          onTap: onTap,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

/// Status shown with icon + text, never colour alone.
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.label, required this.tone, this.dense = false});
  final String label;
  final StatusTone tone;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final (Color fg, IconData icon) = switch (tone) {
      StatusTone.success => (t.success, Icons.check_circle_rounded),
      StatusTone.danger => (t.danger, Icons.cancel_rounded),
      StatusTone.pending => (t.warning, Icons.schedule_rounded),
      StatusTone.info => (t.info, Icons.info_rounded),
      StatusTone.neutral => (t.textMuted, Icons.radio_button_unchecked_rounded),
    };
    return Container(
      padding: EdgeInsets.symmetric(horizontal: dense ? 6 : 8, vertical: dense ? 2 : 4),
      decoration: BoxDecoration(
        color: fg.withValues(alpha: context.brightness == Brightness.dark ? 0.16 : 0.08),
        borderRadius: BorderRadius.circular(Tokens.radiusPill),
        border: Border.all(color: fg.withValues(alpha: 0.35)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: dense ? 14 : 16, color: fg),
        const SizedBox(width: 4),
        Flexible(
          child: Text(label,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: fg, fontWeight: FontWeight.w600, fontSize: dense ? Tokens.fontXs : 13)),
        ),
      ]),
    );
  }
}

class ServiceAvatar extends StatelessWidget {
  const ServiceAvatar({super.key, required this.serviceCode, this.size = 44});
  final String serviceCode;
  final double size;

  @override
  Widget build(BuildContext context) {
    final def = getService(serviceCode) ?? serviceRegistry['CUSTOM']!;
    final a = Tokens.accent(def.accent);
    final b = context.brightness;
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: a.background(b), borderRadius: BorderRadius.circular(Tokens.radiusMd)),
        child: Icon(serviceIcon(def.icon), color: a.foreground(b), size: size * 0.55),
      ),
    );
  }
}

enum BannerTone { info, warning, danger, success }

class InfoBanner extends StatelessWidget {
  const InfoBanner({super.key, required this.text, this.tone = BannerTone.info, this.icon, this.action});
  final String text;
  final BannerTone tone;
  final IconData? icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final (Color fg, IconData defIcon) = switch (tone) {
      BannerTone.info => (t.info, Icons.info_outline_rounded),
      BannerTone.warning => (t.warning, Icons.warning_amber_rounded),
      BannerTone.danger => (t.danger, Icons.error_outline_rounded),
      BannerTone.success => (t.success, Icons.check_circle_outline_rounded),
    };
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(Tokens.s3),
      decoration: BoxDecoration(
        color: fg.withValues(alpha: context.brightness == Brightness.dark ? 0.14 : 0.07),
        borderRadius: BorderRadius.circular(Tokens.radiusMd),
        border: Border.all(color: fg.withValues(alpha: 0.35)),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon ?? defIcon, color: fg, size: 20),
        const SizedBox(width: Tokens.s2),
        Expanded(child: Text(text, style: TextStyle(color: t.text, fontSize: Tokens.fontSm, height: 1.35))),
        if (action != null) ...[const SizedBox(width: Tokens.s2), action!],
      ]),
    );
  }
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.message, this.icon = Icons.inbox_outlined, this.action});
  final String message;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(Tokens.s8),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 48, color: context.tokens.textMuted),
          const SizedBox(height: Tokens.s3),
          Text(message, textAlign: TextAlign.center, style: TextStyle(color: context.tokens.textMuted, fontSize: Tokens.fontMd)),
          if (action != null) ...[const SizedBox(height: Tokens.s4), action!],
        ]),
      );
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, this.onRetry});
  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final rid = error is ApiException ? (error as ApiException).requestId : null;
    return Padding(
      padding: const EdgeInsets.all(Tokens.s6),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.cloud_off_rounded, size: 44, color: context.tokens.textMuted),
        const SizedBox(height: Tokens.s3),
        Text(errorText(context, error), textAlign: TextAlign.center, style: const TextStyle(fontSize: Tokens.fontMd)),
        if (rid != null) ...[
          const SizedBox(height: Tokens.s1),
          Text(context.s.t('mobile.error.requestId', {'id': rid}), style: Theme.of(context).textTheme.bodySmall),
        ],
        if (onRetry != null) ...[
          const SizedBox(height: Tokens.s4),
          OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded), label: Text(context.s.t('common.retry'))),
        ],
      ]),
    );
  }
}

class LoadingView extends StatelessWidget {
  const LoadingView({super.key});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(Tokens.s8),
          child: Semantics(label: context.s.t('common.loading'), child: const CircularProgressIndicator()),
        ),
      );
}

/// Renders an AsyncValue with consistent loading / error states.
class AsyncView<T> extends StatelessWidget {
  const AsyncView({super.key, required this.value, required this.builder, this.onRetry});
  final AsyncValue<T> value;
  final Widget Function(T data) builder;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final v = value;
    if (v.hasValue) return builder(v.requireValue);
    if (v.hasError) return Center(child: ErrorView(error: v.error!, onRetry: onRetry));
    return const LoadingView();
  }
}

/// A label/value row used on detail screens.
class KeyValueRow extends StatelessWidget {
  const KeyValueRow({super.key, required this.label, required this.value, this.valueWidget});
  final String label;
  final String value;
  final Widget? valueWidget;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(flex: 5, child: Text(label, style: TextStyle(color: context.tokens.textMuted))),
          const SizedBox(width: Tokens.s3),
          Expanded(
            flex: 6,
            child: Align(
              alignment: Alignment.centerRight,
              child: valueWidget ?? Text(value, textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w500)),
            ),
          ),
        ]),
      );
}

String opStatusLabel(AppStrings s, String status) => s.t('status.$status');

StatusChip opStatusChip(AppStrings s, String status, {bool dense = false}) =>
    StatusChip(label: opStatusLabel(s, status), tone: opStatusTone(status), dense: dense);

StatusChip paymentChip(AppStrings s, String status, {bool dense = false}) =>
    StatusChip(label: s.t('payment.$status'), tone: paymentTone(status), dense: dense);

/// Label for a service code, including custom service names when known.
String serviceLabel(AppStrings s, String code, {String? customName}) => code == 'CUSTOM' && customName != null ? customName : s.t('service.$code.name');
