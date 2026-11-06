/**
 * Operational, payment, posting and connector statuses are independent dimensions.
 * A manual record marked SUCCESSFUL means the operator *reported* success on an external system.
 */
export const WORKFLOW_TYPES = ['TRANSACTION', 'APPLICATION'] as const;
export type WorkflowType = (typeof WORKFLOW_TYPES)[number];

export const TRANSACTION_STATUSES = [
  'DRAFT',
  'PENDING',
  'SUCCESSFUL',
  'FAILED',
  'CANCELLED',
] as const;
export const APPLICATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;
export const OP_STATUSES = [
  'DRAFT',
  'PENDING',
  'SUCCESSFUL',
  'FAILED',
  'CANCELLED',
  'SUBMITTED',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED',
] as const;
export type OpStatus = (typeof OP_STATUSES)[number];

export const PAYMENT_STATUSES = ['NOT_APPLICABLE', 'UNPAID', 'PARTIAL', 'PAID'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** NOT_REQUIRED: the record has no cash effect (e.g. balance enquiry with no fee). */
export const POSTING_STATUSES = ['UNPOSTED', 'POSTED', 'REVERSED', 'NOT_REQUIRED'] as const;
export type PostingStatus = (typeof POSTING_STATUSES)[number];

export const CONNECTOR_STATUSES = [
  'NONE',
  'INITIATED',
  'PENDING',
  'UNKNOWN',
  'CONFIRMED',
  'FAILED',
] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

export const RECORD_SOURCES = ['MANUAL', 'MOBILE_SYNC', 'PROVIDER'] as const;
export type RecordSource = (typeof RECORD_SOURCES)[number];

const TX_TRANSITIONS: Record<string, OpStatus[]> = {
  DRAFT: ['PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED'],
  PENDING: ['SUCCESSFUL', 'FAILED', 'CANCELLED'],
  // Correction path: a reported success later found to have failed.
  SUCCESSFUL: ['FAILED'],
  FAILED: [],
  CANCELLED: [],
};

const APP_TRANSITIONS: Record<string, OpStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'REJECTED', 'CANCELLED'],
  COMPLETED: [],
  // Resubmission after rejection.
  REJECTED: ['SUBMITTED'],
  CANCELLED: [],
};

export function initialStatuses(workflow: WorkflowType): readonly OpStatus[] {
  return workflow === 'TRANSACTION' ? TRANSACTION_STATUSES : APPLICATION_STATUSES;
}

export function allowedTransitions(workflow: WorkflowType, from: OpStatus): OpStatus[] {
  return (workflow === 'TRANSACTION' ? TX_TRANSITIONS : APP_TRANSITIONS)[from] ?? [];
}

export function canTransition(workflow: WorkflowType, from: OpStatus, to: OpStatus): boolean {
  return allowedTransitions(workflow, from).includes(to);
}

/** Transitions that require a written reason (corrections, rejections, cancellations). */
export function transitionNeedsReason(from: OpStatus, to: OpStatus): boolean {
  return to === 'CANCELLED' || to === 'REJECTED' || (from === 'SUCCESSFUL' && to === 'FAILED');
}

/** Statuses in which a record's cash movement may be posted to the cashbook. */
export function isPostableStatus(workflow: WorkflowType, s: OpStatus): boolean {
  return workflow === 'TRANSACTION'
    ? s === 'PENDING' || s === 'SUCCESSFUL'
    : s === 'SUBMITTED' || s === 'IN_PROGRESS' || s === 'COMPLETED';
}

export function isOpenApplication(s: OpStatus): boolean {
  return s === 'SUBMITTED' || s === 'IN_PROGRESS';
}
