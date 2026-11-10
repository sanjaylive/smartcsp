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
            Flexible(child: ServiceGrid(codes: codes, framed: false, onTap: (c) => Navigator.of(sheet).pop(c))),
          ]),
        ),
      );
    }),
  );
  if (code != null && context.mounted) await startNewRecord(context, ref, code);
}

/// Grid of service shortcuts: a small tinted icon chip with the name underneath, inside one card.
class ServiceGrid extends StatelessWidget {
  const ServiceGrid({super.key, required this.codes, required this.onTap, this.framed = true});
  final List<String> codes;
  final ValueChanged<String> onTap;

  /// Wrap the grid in a card (home). The picker sheet is already a surface, so it passes false.
  final bool framed;

  @override
  Widget build(BuildContext context) {
    final grid = LayoutBuilder(builder: (context, c) {
      final cols = c.maxWidth > 560 ? 6 : 4;
      // Icon chip + two label lines at the (capped) text scale + padding.
      final label = MediaQuery.textScalerOf(context).clamp(maxScaleFactor: _maxLabelScale).scale(_labelSize) * 1.2;
      final extent = (Tokens.s2 * 2) + 44 + 6 + label * 2 + 4;
      return GridView.builder(
        shrinkWrap: true,
        padding: EdgeInsets.zero,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: codes.length,
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: cols,
          mainAxisSpacing: Tokens.s1,
          crossAxisSpacing: Tokens.s1,
          mainAxisExtent: extent,
        ),
        itemBuilder: (_, i) => _ServiceTile(code: codes[i], onTap: onTap),
      );
    });
    if (!framed) return grid;
    final t = context.tokens;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Tokens.s1, vertical: Tokens.s2),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(Tokens.radiusLg),
        border: Border.all(color: t.border),
      ),
      child: grid,
    );
  }
}

const double _labelSize = 12;
const double _maxLabelScale = 1.15;

class _ServiceTile extends StatelessWidget {
  const _ServiceTile({required this.code, required this.onTap});
  final String code;
  final ValueChanged<String> onTap;

  @override
  Widget build(BuildContext context) {
    final b = context.brightness;
    final def = getService(code) ?? serviceRegistry['CUSTOM']!;
    final a = Tokens.accent(def.accent);
    return InkWell(
      key: Key('service.$code'),
      borderRadius: BorderRadius.circular(Tokens.radiusMd),
      onTap: () => onTap(code),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2, vertical: Tokens.s2),
        child: Column(mainAxisAlignment: MainAxisAlignment.start, children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: a.background(b), borderRadius: BorderRadius.circular(Tokens.radiusMd + 2)),
            child: Icon(serviceIcon(def.icon), color: a.foreground(b), size: 22),
          ),
          const SizedBox(height: 6),
          Text(
            context.s.t(def.labelKey),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            textScaler: MediaQuery.textScalerOf(context).clamp(maxScaleFactor: _maxLabelScale),
            style: TextStyle(color: context.tokens.text, fontWeight: FontWeight.w500, fontSize: _labelSize, height: 1.2),
          ),
        ]),
      ),
    );
  }
}
