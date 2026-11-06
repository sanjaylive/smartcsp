import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/env.dart';
import '../../core/registry/field_validation.dart';
import '../../data/api/api_exception.dart';
import '../../data/models/auth_models.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/brand.dart';
import '../../widgets/common.dart';

/// Email OTP sign-in: email + consent → 6-digit code (paste, auto-submit, resend cooldown).
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _codeFocus = FocusNode();
  bool _consent = false;
  bool _busy = false;
  String? _emailError;
  String? _consentError;
  String? _codeError;
  String? _info;
  OtpChallenge? _challenge;
  String _sentTo = '';
  int _resendIn = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _email.dispose();
    _code.dispose();
    _codeFocus.dispose();
    super.dispose();
  }

  void _startCooldown(int seconds) {
    _timer?.cancel();
    setState(() => _resendIn = seconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _resendIn = (_resendIn - 1).clamp(0, 9999));
      if (_resendIn == 0) t.cancel();
    });
  }

  Future<void> _sendCode({bool resend = false}) async {
    final s = context.s;
    final email = _email.text.trim();
    setState(() {
      _emailError = validateEmail(email) != null ? s.t('validation.email') : null;
      _consentError = _consent ? null : s.t('validation.consent');
      _info = null;
    });
    if (_emailError != null || _consentError != null) return;
    setState(() => _busy = true);
    try {
      final ch = await ref.read(apiProvider).requestOtp(email);
      if (!mounted) return;
      setState(() {
        _challenge = ch;
        _sentTo = email.toLowerCase();
        _code.clear();
        _codeError = null;
        _info = resend ? s.t('mobile.auth.resent') : s.t('auth.email.sent');
      });
      _startCooldown(ch.resendAfterSeconds);
      _codeFocus.requestFocus();
    } on ApiException catch (e) {
      if (!mounted) return;
      final retry = e.details['retryAfterSeconds'];
      if (e.code == 'OTP_RESEND_COOLDOWN' && retry is num) _startCooldown(retry.toInt());
      setState(() {
        if (_challenge == null) {
          _emailError = e.fieldMessage('email') != null ? s.t('validation.email') : errorText(context, e);
        } else {
          _codeError = errorText(context, e);
        }
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    final s = context.s;
    final code = _code.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(code)) {
      setState(() => _codeError = s.t('validation.otp'));
      return;
    }
    final ch = _challenge;
    if (ch == null || _busy) return;
    setState(() {
      _busy = true;
      _codeError = null;
    });
    try {
      final result = await ref.read(apiProvider).verifyOtp(challengeId: ch.challengeId, email: _sentTo, code: code, deviceName: Env.deviceName);
      await ref.read(authProvider.notifier).completeSignIn(result);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _codeError = errorText(context, e));
      _code.selection = TextSelection(baseOffset: 0, extentOffset: _code.text.length);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _paste() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    final digits = RegExp(r'\d{6}').firstMatch(data?.text ?? '')?.group(0);
    if (digits == null) {
      setState(() => _codeError = context.s.t('validation.otp'));
      return;
    }
    _code.text = digits;
    await _verify();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Tokens.s5),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const BrandHeader(),
                const SizedBox(height: Tokens.s6),
                AppCard(
                  padding: const EdgeInsets.all(Tokens.s5),
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: _challenge == null ? _emailStep(s) : _otpStep(s),
                  ),
                ),
                const SizedBox(height: Tokens.s4),
                Text(s.t('app.disclaimer'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
              ]),
            ),
          ),
        ),
      ),
    );
  }

  Widget _emailStep(AppStrings s) => Column(
        key: const ValueKey('email'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(s.t('auth.email.title'), style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: Tokens.s4),
          TextField(
            key: const Key('login.email'),
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            textInputAction: TextInputAction.done,
            autocorrect: false,
            enabled: !_busy,
            onSubmitted: (_) => _sendCode(),
            decoration: InputDecoration(
              labelText: s.t('auth.email.label'),
              helperText: s.t('auth.email.help'),
              errorText: _emailError,
              prefixIcon: const Icon(Icons.mail_outline_rounded),
            ),
          ),
          const SizedBox(height: Tokens.s2),
          CheckboxListTile(
            key: const Key('login.consent'),
            value: _consent,
            onChanged: _busy ? null : (v) => setState(() => _consent = v ?? false),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
            title: Text(s.t('auth.email.consent'), style: const TextStyle(fontSize: Tokens.fontSm)),
            subtitle: _consentError == null ? null : Text(_consentError!, style: TextStyle(color: context.tokens.danger)),
          ),
          const SizedBox(height: Tokens.s3),
          FilledButton(
            key: const Key('login.send'),
            onPressed: _busy ? null : _sendCode,
            child: _busy ? const _ButtonSpinner() : Text(s.t('auth.email.send')),
          ),
        ],
      );

  Widget _otpStep(AppStrings s) => Column(
        key: const ValueKey('otp'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(s.t('auth.otp.title'), style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: Tokens.s2),
          Text(s.t('auth.otp.help', {'email': _sentTo}), style: TextStyle(color: context.tokens.textMuted)),
          if (_info != null) ...[
            const SizedBox(height: Tokens.s3),
            InfoBanner(text: _info!, tone: BannerTone.success),
          ],
          const SizedBox(height: Tokens.s4),
          Semantics(
            label: s.t('auth.otp.label'),
            textField: true,
            child: TextField(
              key: const Key('login.code'),
              controller: _code,
              focusNode: _codeFocus,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              textAlign: TextAlign.center,
              maxLength: 6,
              enabled: !_busy,
              style: const TextStyle(fontSize: 28, letterSpacing: 12, fontWeight: FontWeight.w600, fontFeatures: moneyFeatures),
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
              onChanged: (v) {
                if (_codeError != null) setState(() => _codeError = null);
                if (v.length == 6) _verify();
              },
              onSubmitted: (_) => _verify(),
              decoration: InputDecoration(
                labelText: s.t('auth.otp.label'),
                counterText: '',
                errorText: _codeError,
                suffixIcon: IconButton(
                  tooltip: s.t('mobile.auth.pasteCode'),
                  icon: const Icon(Icons.content_paste_rounded),
                  onPressed: _busy ? null : _paste,
                ),
              ),
            ),
          ),
          const SizedBox(height: Tokens.s4),
          FilledButton(
            key: const Key('login.verify'),
            onPressed: _busy ? null : _verify,
            child: _busy ? const _ButtonSpinner() : Text(s.t('auth.otp.verify')),
          ),
          const SizedBox(height: Tokens.s2),
          Row(children: [
            Expanded(
              child: TextButton(
                onPressed: _busy
                    ? null
                    : () => setState(() {
                          _challenge = null;
                          _code.clear();
                          _codeError = null;
                          _info = null;
                        }),
                child: Text(s.t('auth.otp.changeEmail'), textAlign: TextAlign.center),
              ),
            ),
            Expanded(
              child: TextButton(
                key: const Key('login.resend'),
                onPressed: _busy || _resendIn > 0 ? null : () => _sendCode(resend: true),
                child: Text(
                  _resendIn > 0 ? s.t('auth.otp.resendIn', {'seconds': _resendIn}) : s.t('auth.otp.resend'),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          ]),
        ],
      );
}

class _ButtonSpinner extends StatelessWidget {
  const _ButtonSpinner();

  @override
  Widget build(BuildContext context) => const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white));
}
