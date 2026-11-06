// Port of packages/shared/src/status.ts. Operational, payment and posting statuses are separate.
// A manual record marked SUCCESSFUL means the operator *reported* success on an external system.
import 'registry/services.dart';

const transactionStatuses = ['DRAFT', 'PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED'];
const applicationStatuses = ['DRAFT', 'SUBMITTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED'];
const opStatuses = ['DRAFT', 'PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'SUBMITTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'];
const paymentStatuses = ['NOT_APPLICABLE', 'UNPAID', 'PARTIAL', 'PAID'];

const _tx = <String, List<String>>{
  'DRAFT': ['PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED'],
  'PENDING': ['SUCCESSFUL', 'FAILED', 'CANCELLED'],
  'SUCCESSFUL': ['FAILED'],
  'FAILED': [],
  'CANCELLED': [],
};

const _app = <String, List<String>>{
  'DRAFT': ['SUBMITTED', 'CANCELLED'],
  'SUBMITTED': ['IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED'],
  'IN_PROGRESS': ['COMPLETED', 'REJECTED', 'CANCELLED'],
  'COMPLETED': [],
  'REJECTED': ['SUBMITTED'],
  'CANCELLED': [],
};

List<String> initialStatuses(WorkflowType w) => w == WorkflowType.transaction ? transactionStatuses : applicationStatuses;

List<String> allowedTransitions(WorkflowType w, String from) => (w == WorkflowType.transaction ? _tx : _app)[from] ?? const [];

bool transitionNeedsReason(String from, String to) =>
    to == 'CANCELLED' || to == 'REJECTED' || (from == 'SUCCESSFUL' && to == 'FAILED');

bool isPostableStatus(WorkflowType w, String s) =>
    w == WorkflowType.transaction ? (s == 'PENDING' || s == 'SUCCESSFUL') : (s == 'SUBMITTED' || s == 'IN_PROGRESS' || s == 'COMPLETED');

/// Sensible default status for a new record of this workflow.
String defaultNewStatus(WorkflowType w) => w == WorkflowType.transaction ? 'SUCCESSFUL' : 'SUBMITTED';

/// Visual tone of a status. Colour is never the only signal: the label and an icon are always shown.
enum StatusTone { neutral, pending, success, danger, info }

StatusTone opStatusTone(String s) => switch (s) {
      'SUCCESSFUL' || 'COMPLETED' => StatusTone.success,
      'FAILED' || 'REJECTED' || 'CANCELLED' => StatusTone.danger,
      'PENDING' || 'SUBMITTED' || 'IN_PROGRESS' => StatusTone.pending,
      _ => StatusTone.neutral,
    };

StatusTone paymentTone(String s) => switch (s) {
      'PAID' => StatusTone.success,
      'PARTIAL' => StatusTone.pending,
      'UNPAID' => StatusTone.danger,
      _ => StatusTone.neutral,
    };

/// Customer receivable for a record (mirrors apps/api posting.ts `receivableFor`).
int receivableFor(PrincipalDirection d, int principal, int fee) => d == PrincipalDirection.collect ? principal + fee : fee;

/// Net change in the cash drawer (mirrors posting.ts `cashEffect`).
int cashEffect({
  required PrincipalDirection direction,
  required int principal,
  required int collected,
  required String paymentMethod,
  required String principalMethod,
}) {
  var cash = 0;
  if (direction == PrincipalDirection.payout && principalMethod == 'CASH') cash -= principal;
  if (paymentMethod == 'CASH') cash += collected;
  return cash;
}
