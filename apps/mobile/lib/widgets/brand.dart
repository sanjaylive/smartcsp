import 'package:flutter/material.dart';

import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../theme/tokens.dart';

/// Simple CSP2All mark: a flat brand-red rounded square with a ledger glyph. No third-party logos.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 56});
  final double size;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: Tokens.light.brand,
            borderRadius: BorderRadius.circular(size * 0.28),
          ),
          child: Icon(Icons.menu_book_rounded, color: Colors.white, size: size * 0.55),
        ),
      );
}

class BrandHeader extends StatelessWidget {
  const BrandHeader({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    return Column(children: [
      const BrandMark(size: 64),
      const SizedBox(height: Tokens.s3),
      Text(s.t('app.name'), style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
      const SizedBox(height: Tokens.s1),
      Text(s.t('app.tagline'), textAlign: TextAlign.center, style: TextStyle(color: context.tokens.textMuted)),
      const SizedBox(height: Tokens.s1),
      Text(s.t('mobile.auth.independent'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
    ]);
  }
}

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(
        body: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [BrandMark(size: 72), SizedBox(height: 24), CircularProgressIndicator()])),
      );
}
