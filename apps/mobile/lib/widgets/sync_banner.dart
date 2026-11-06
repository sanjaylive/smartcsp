import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../l10n/strings.dart';
import '../state/providers.dart';
import '../theme/tokens.dart';
import 'common.dart';

/// Shows device drafts that are not yet saved to the shop. Never mixes them with server records.
class SyncBanner extends ConsumerWidget {
  const SyncBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final sync = ref.watch(syncProvider);
    if (sync.pending == 0 && sync.failed == 0) return const SizedBox.shrink();
    final failed = sync.failed > 0;
    return Padding(
      padding: const EdgeInsets.only(top: Tokens.s3),
      child: InkWell(
        borderRadius: BorderRadius.circular(Tokens.radiusMd),
        onTap: () => context.push('/drafts'),
        child: InfoBanner(
          tone: failed ? BannerTone.danger : BannerTone.warning,
          icon: failed ? Icons.sync_problem_rounded : Icons.cloud_upload_outlined,
          text: [
            if (sync.pending > 0) s.t('mobile.drafts.count', {'count': sync.pending}),
            if (failed) s.t('mobile.drafts.failedCount', {'count': sync.failed}),
            s.t('mobile.draftNotConfirmed'),
          ].join('\n'),
          action: sync.running
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.chevron_right_rounded),
        ),
      ),
    );
  }
}

class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(onlineProvider).value ?? true;
    if (online) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: Tokens.s3),
      child: InfoBanner(text: context.s.t('mobile.offline'), tone: BannerTone.warning, icon: Icons.wifi_off_rounded),
    );
  }
}
