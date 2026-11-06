import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/registry/services.dart';
import '../../data/models/tenant_models.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

/// Opens the record form for [code]. CUSTOM asks which custom service first.
Future<void> startNewRecord(BuildContext context, WidgetRef ref, String code) async {
  if (code != 'CUSTOM') {
    context.push('/records/new?service=$code');
    return;
  }
  final ctx = ref.read(tenantContextProvider).value;
  final customs = ctx?.activeCustomServices ?? const <CustomService>[];
  if (customs.length == 1) {
    context.push('/records/new?service=CUSTOM&custom=${customs.first.id}');
    return;
  }
  final picked = await showModalBottomSheet<CustomService>(
    context: context,
    showDragHandle: true,
    builder: (sheet) => SafeArea(
      child: ListView(shrinkWrap: true, children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Tokens.s4),
          child: Text(sheet.s.t('mobile.record.customService'), style: Theme.of(sheet).textTheme.titleMedium),
        ),
        if (customs.isEmpty) EmptyView(message: sheet.s.t('service.CUSTOM.description')),
        for (final c in customs)
          ListTile(
            leading: const ServiceAvatar(serviceCode: 'CUSTOM', size: 40),
            title: Text(c.name),
            subtitle: Text(c.category),
            onTap: () => Navigator.of(sheet).pop(c),
          ),
      ]),
    ),
  );
  if (picked != null && context.mounted) context.push('/records/new?service=CUSTOM&custom=${picked.id}');
}

/// Bottom sheet listing every service the user can record.
Future<void> showServicePicker(BuildContext context, WidgetRef ref) async {
  final code = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (sheet) => Consumer(builder: (sheet, ref, _) {
      final ctx = ref.watch(tenantContextProvider).value;
      final codes = ctx?.quickActions ?? const <String>[];
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Tokens.s4, 0, Tokens.s4, Tokens.s4),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(sheet.s.t('mobile.record.chooseService'), style: Theme.of(sheet).textTheme.titleMedium),
            const SizedBox(height: Tokens.s3),
            if (codes.isEmpty) InfoBanner(text: sheet.s.t('mobile.home.noServices'), tone: BannerTone.warning),
            Flexible(child: ServiceGrid(codes: codes, onTap: (c) => Navigator.of(sheet).pop(c))),
          ]),
        ),
      );
    }),
  );
  if (code != null && context.mounted) await startNewRecord(context, ref, code);
}

/// Grid of service shortcut tiles with registry icon and accent.
class ServiceGrid extends StatelessWidget {
  const ServiceGrid({super.key, required this.codes, required this.onTap});
  final List<String> codes;
  final ValueChanged<String> onTap;

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final b = context.brightness;
    return LayoutBuilder(builder: (context, c) {
      final cols = c.maxWidth > 560 ? 4 : 3;
      return GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: codes.length,
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: cols,
          mainAxisSpacing: Tokens.s2,
          crossAxisSpacing: Tokens.s2,
          childAspectRatio: 0.95,
        ),
        itemBuilder: (_, i) {
          final code = codes[i];
          final def = getService(code) ?? serviceRegistry['CUSTOM']!;
          final a = Tokens.accent(def.accent);
          return Material(
            color: a.background(b),
            borderRadius: BorderRadius.circular(Tokens.radiusLg),
            child: InkWell(
              key: Key('service.$code'),
              borderRadius: BorderRadius.circular(Tokens.radiusLg),
              onTap: () => onTap(code),
              child: Padding(
                padding: const EdgeInsets.all(Tokens.s2),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(serviceIcon(def.icon), color: a.foreground(b), size: 30),
                  const SizedBox(height: Tokens.s2),
                  Text(
                    s.t(def.labelKey),
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: a.foreground(b), fontWeight: FontWeight.w600, fontSize: 13, height: 1.2),
                  ),
                ]),
              ),
            ),
          );
        },
      );
    });
  }
}
