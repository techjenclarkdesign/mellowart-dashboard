/**
 * Two independent state machines for a submission.
 *
 *  Decision:  pending → approved | rejected           (admin-driven, sync)
 *  Payment:   none → invoicing → awaiting_payment → paid
 *             (+ overdue / voided)                     (Xero-driven, async)
 *
 * The UI shows a single derived badge computed from both.
 */

export type ReviewStatus = "pending" | "approved" | "rejected";

export type PaymentStatus =
  | "none"
  | "invoicing"
  | "awaiting_payment"
  | "paid"
  | "overdue"
  | "voided";

export const REVIEW_STATUSES: ReviewStatus[] = [
  "pending",
  "approved",
  "rejected",
];

// Decision transitions are only allowed out of `pending` (idempotency guard).
export function canApprove(status: ReviewStatus): boolean {
  return status === "pending";
}

export function canReject(status: ReviewStatus): boolean {
  return status === "pending";
}

/**
 * Payment statuses an admin may set by hand. Without the Xero webhook, the
 * admin reconciles payment state manually from the Xero dashboard. Lives here
 * (not in payments.server) so the client UI can import it safely.
 */
export const MANUAL_PAYMENT_STATUSES = [
  "awaiting_payment",
  "paid",
  "overdue",
  "voided",
] as const;

export type ManualPaymentStatus = (typeof MANUAL_PAYMENT_STATUSES)[number];

export function isManualPaymentStatus(v: string): v is ManualPaymentStatus {
  return (MANUAL_PAYMENT_STATUSES as readonly string[]).includes(v);
}

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  none: "—",
  invoicing: "Invoicing",
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
  overdue: "Overdue",
  voided: "Voided",
};

export type BadgeVariant = "secondary" | "default" | "destructive" | "outline";

export interface StatusBadge {
  label: string;
  variant: BadgeVariant;
}

// approved → badge keyed by the payment machine.
const APPROVED_BADGE: Record<PaymentStatus, StatusBadge> = {
  none: { label: "Approved", variant: "default" },
  invoicing: { label: "Approved · Invoicing", variant: "outline" },
  awaiting_payment: {
    label: "Approved · Awaiting payment",
    variant: "outline",
  },
  paid: { label: "Approved · Paid", variant: "default" },
  overdue: { label: "Approved · Overdue", variant: "destructive" },
  voided: { label: "Approved · Invoice voided", variant: "destructive" },
};

/** Single badge derived from both machines. */
export function deriveStatus(
  review: ReviewStatus,
  payment: PaymentStatus,
): StatusBadge {
  if (review === "pending") return { label: "Pending", variant: "secondary" };
  if (review === "rejected") return { label: "Rejected", variant: "destructive" };
  return APPROVED_BADGE[payment];
}
