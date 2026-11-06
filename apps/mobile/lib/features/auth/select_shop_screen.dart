import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/status.dart';
import '../../data/api/api_exception.dart';
import '../../l10n/strings.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/common.dart';

class SelectShopScreen extends ConsumerStatefulWidget {
  const SelectShopScreen({super.key});

  @override
  ConsumerState<SelectShopScreen> createState() => _SelectShopScreenState();
}

class _SelectShopScreenState extends ConsumerState<SelectShopScreen> {
  String? _busyId;

  Future<void> _select(String tenantId) async {
    setState(() => _busyId = tenantId);
    try {
      final before = ref.read(activeTenantIdProvider);
      await ref.read(authProvider.notifier).selectTenant(tenantId);
      if (before != null && before != tenantId) {
        ref.invalidate(tenantContextProvider);
        ref.invalidate(dashboardProvider);
      }
      if (mounted && context.canPop()) context.pop();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, errorText(context, e), error: true);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.s;
    final me = ref.watch(authProvider).me;
    final tenants = me?.tenants ?? const [];
    return Scaffold(
      appBar: AppBar(
        title: Text(s.t('auth.tenant.title')),
        actions: [
          IconButton(
            tooltip: s.t('common.logout'),
            icon: const Icon(Icons.logout_rounded),
            onPressed: () => ref.read(authProvider.notifier).logout(),
          ),
        ],
      ),
      body: ListView.separated(
        padding: const EdgeInsets.all(Tokens.s4),
        itemCount: tenants.length,
        separatorBuilder: (_, _) => const SizedBox(height: Tokens.s3),
        itemBuilder: (_, i) {
          final t = tenants[i];
          final active = t.tenantId == me?.activeTenantId;
          return AppCard(
            onTap: _busyId == null ? () => _select(t.tenantId) : null,
            child: Row(children: [
              CircleAvatar(
                backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                child: Text(t.name.isEmpty ? '?' : t.name[0].toUpperCase(),
                    style: TextStyle(color: Theme.of(context).colorScheme.onPrimaryContainer, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: Tokens.s3),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(t.name, style: Theme.of(context).textTheme.titleSmall),
                  Text([s.t('role.${t.role}'), if (t.place.isNotEmpty) t.place].join(' · '), style: TextStyle(color: context.tokens.textMuted)),
                  if (t.tenantStatus == 'SUSPENDED') ...[
                    const SizedBox(height: 4),
                    StatusChip(label: s.t('error.TENANT_SUSPENDED'), tone: StatusTone.danger, dense: true),
                  ],
                ]),
              ),
              if (_busyId == t.tenantId)
                const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
              else if (active)
                Icon(Icons.check_circle_rounded, color: context.tokens.success, semanticLabel: s.t('mobile.settings.activeShop'))
              else
                const Icon(Icons.chevron_right_rounded),
            ]),
          );
        },
      ),
    );
  }
}
