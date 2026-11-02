import { apiErrorCode } from "@/shared/lib/api/collections-client";
import type { WorkspaceBilling } from "@/entities/workspace-billing";

/**
 * The plan tab's state machine (SDL-748) — pure, so the smoke drives it
 * without a screen.
 *
 * The SERVER says what the workspace is (pro, the payer or not, payments on
 * or off, a checkout started). The TAB only remembers what this person did
 * here: clicked Upgrade, has the Paddle window open, finished paying, saw a
 * refusal. `planStateOf` folds the two into one of the canvas cases.
 *
 * A `pending_checkout` from the server means «a checkout was STARTED», never
 * «paid» (a paid transaction is not reported as pending). So on its own it
 * keeps the Upgrade button — repeating is safe, the same period returns the
 * same transaction — and only adds the «checkout started» line. «Activating
 * Pro…» comes only from Paddle's `checkout.completed` in this tab, or after a
 * reload from the record this tab wrote at that moment
 * (`rememberPaidTransaction`) while it is younger than `PAID_TTL_MS` —
 * whatever `pending_checkout` says: the backend drops the pending on the
 * transaction webhook and sets Pro only on the subscription one, so in
 * between a reload sees neither, and a button there would start a SECOND
 * payment.
 */
export type PlanState =
  | "free"
  | "creating"
  | "checkout"
  | "processing"
  | "pro"
  | "error"
  | "member"
  | "disabled"
  /**
   * SDL-749: Free after the grace period ran out with the card still
   * failing (status past_due). No Upgrade — checkout answers 409
   * billing_past_due, the card is changed in the Paddle portal.
   */
  | "past_due";

/**
 * A line under the Upgrade button, never an error:
 * `started` — the server holds an unfinished checkout;
 * `period` — the transaction came back priced for another period, the switch
 *   now shows that period and Paddle was NOT opened;
 * `busy` — another request of this workspace is creating a checkout
 *   (409 billing_checkout_in_progress).
 */
export type PlanNotice = "started" | "period" | "busy";

export type PlanPhase =
  | { kind: "idle" }
  | { kind: "notice"; reason: "period" | "busy" }
  | { kind: "creating" }
  | { kind: "checkout" }
  | { kind: "processing"; slow: boolean }
  | { kind: "error" }
  | { kind: "unavailable" };

export type PlanEvent =
  | { type: "upgrade" }
  | { type: "opened" }
  | { type: "completed" }
  | { type: "closed" }
  | { type: "failed" }
  | { type: "unavailable" }
  | { type: "reset" }
  | { type: "notice"; reason: "period" | "busy" }
  /** On load: the server's pending transaction is the one this tab paid. */
  | { type: "resume" }
  | { type: "timeout" }
  /** The plan arrived as Pro: the wait is over, polling stops. */
  | { type: "settled" }
  /** The paid record outlived `PAID_TTL_MS` without Pro: the button returns. */
  | { type: "expired" }
  /**
   * 409 billing_payment_processing: the workspace already has a paid,
   * not yet subscribed transaction (paid in another tab) — wait like after
   * our own payment, never offer a second one.
   */
  | { type: "paid-elsewhere" };

export const INITIAL_PLAN_PHASE: PlanPhase = { kind: "idle" };

export function planReducer(phase: PlanPhase, event: PlanEvent): PlanPhase {
  switch (event.type) {
    case "upgrade":
      // A second click while a checkout is being created or is open is
      // dropped here as well as by the disabled button.
      return phase.kind === "idle" ||
        phase.kind === "notice" ||
        phase.kind === "error"
        ? { kind: "creating" }
        : phase;
    case "opened":
      return phase.kind === "creating" ? { kind: "checkout" } : phase;
    case "completed":
      return phase.kind === "creating" || phase.kind === "checkout"
        ? { kind: "processing", slow: false }
        : phase;
    case "closed":
      return phase.kind === "checkout" ? { kind: "idle" } : phase;
    case "failed":
      return phase.kind === "creating" || phase.kind === "checkout"
        ? { kind: "error" }
        : phase;
    case "unavailable":
      return { kind: "unavailable" };
    case "reset":
      return { kind: "idle" };
    case "notice":
      return phase.kind === "creating"
        ? { kind: "notice", reason: event.reason }
        : phase;
    case "resume":
      return phase.kind === "idle" ? { kind: "processing", slow: false } : phase;
    case "timeout":
      return phase.kind === "processing" ? { kind: "processing", slow: true } : phase;
    case "paid-elsewhere":
      return phase.kind === "creating" ? { kind: "processing", slow: false } : phase;
    case "settled":
    case "expired":
      return phase.kind === "processing" ? { kind: "idle" } : phase;
  }
}

export function planStateOf(
  billing: WorkspaceBilling,
  phase: PlanPhase
): { state: PlanState; slow: boolean; notice: PlanNotice | null } {
  const plain = (state: PlanState) => ({ state, slow: false, notice: null });
  if (billing.plan === "pro") return plain("pro");
  if (!billing.can_pay) return plain("member");
  if (billing.subscription_status === "past_due") return plain("past_due");
  switch (phase.kind) {
    case "processing":
      return { state: "processing", slow: phase.slow, notice: null };
    case "creating":
    case "checkout":
    case "error":
      return plain(phase.kind);
    case "unavailable":
      return plain("disabled");
    case "notice":
      return billing.checkout_enabled
        ? { state: "free", slow: false, notice: phase.reason }
        : plain("disabled");
    case "idle":
      break;
  }
  if (!billing.checkout_enabled) return plain("disabled");
  return {
    state: "free",
    slow: false,
    notice: billing.pending_checkout?.transaction_id ? "started" : null,
  };
}

/** What a refused POST …/billing/checkout means for the screen. */
export type CheckoutFailure =
  | "subscribed"
  | "processing"
  | "busy"
  | "disabled"
  | "forbidden"
  | "past_due"
  | "failed";

export function checkoutFailureOf(error: unknown): CheckoutFailure {
  switch (apiErrorCode(error)) {
    case "billing_already_subscribed":
      return "subscribed";
    case "billing_checkout_in_progress":
      return "busy";
    case "billing_payment_processing":
      return "processing";
    case "billing_disabled":
      return "disabled";
    case "billing_past_due":
      return "past_due";
  }
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 409) return "subscribed";
  if (status === 403) return "forbidden";
  return "failed";
}

/**
 * What a refused POST …/billing/portal means for the screen (SDL-749):
 * `no_subscription` — 409 billing_no_subscription (no Paddle customer yet);
 * `forbidden` — 403, no longer the payer; `disabled` — 404 billing_disabled;
 * `failed` — 502 billing_provider_error or anything else, try again.
 */
export type PortalFailure = "no_subscription" | "forbidden" | "disabled" | "failed";

export function portalFailureOf(error: unknown): PortalFailure {
  switch (apiErrorCode(error)) {
    case "billing_no_subscription":
      return "no_subscription";
    case "billing_disabled":
      return "disabled";
  }
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 403) return "forbidden";
  if (status === 409) return "no_subscription";
  return "failed";
}

/**
 * An RFC 3339 date of the billing API as a calendar date in `locale`
 * («14 Oct 2026»), read in UTC like the server writes it. Empty or broken →
 * null, so the row is simply not drawn.
 */
export function formatBillingDate(
  value: string | null | undefined,
  locale: string
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Hosts of Paddle's customer portal (SDL-749), production and sandbox. A
 * portal link is followed only over https and only to these hosts — the
 * checkout fallback keeps its own, looser rule (`isSafeCheckoutUrl`).
 */
export const PADDLE_PORTAL_HOSTS: readonly string[] = [
  "customer-portal.paddle.com",
  "sandbox-customer-portal.paddle.com",
];

export function isSafePortalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && PADDLE_PORTAL_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

/** Paddle's hosted checkout is followed only over https. */
export function isSafeCheckoutUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/*
  The transaction this tab saw paid (`checkout.completed`), per workspace, in
  sessionStorage as {transaction_id, saved_at}: a reload between the payment
  and Pro must show «Activating Pro…», not the button again — a click there
  would create a new transaction and charge twice. The record is trusted for
  `PAID_TTL_MS` only, so a payment that never turns into Pro does not hide the
  button forever. Storage that throws (private mode, blocked) only loses the
  reload case; the open tab keeps its own clock.
*/
export const PAID_TTL_MS = 30 * 60 * 1000;

export interface PaidRecord {
  transaction_id: string;
  /** Epoch milliseconds. */
  saved_at: number;
}

const paidKey = (workspaceId: string) => `markerloop:billing:paid:${workspaceId}`;

export function rememberPaidTransaction(
  workspaceId: string,
  transactionId: string,
  savedAt: number = Date.now()
): void {
  try {
    const record: PaidRecord = { transaction_id: transactionId, saved_at: savedAt };
    window.sessionStorage.setItem(paidKey(workspaceId), JSON.stringify(record));
  } catch {
    /* storage unavailable */
  }
}

/** The fresh record, or null; a stale or unreadable one is removed. */
export function paidTransaction(
  workspaceId: string,
  ttlMs: number = PAID_TTL_MS,
  now: number = Date.now()
): PaidRecord | null {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(paidKey(workspaceId));
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<PaidRecord> | null;
    if (
      value &&
      typeof value.transaction_id === "string" &&
      value.transaction_id !== "" &&
      typeof value.saved_at === "number" &&
      now - value.saved_at >= 0 &&
      now - value.saved_at < ttlMs
    ) {
      return { transaction_id: value.transaction_id, saved_at: value.saved_at };
    }
  } catch {
    /* not ours or broken */
  }
  forgetPaidTransaction(workspaceId);
  return null;
}

export function forgetPaidTransaction(workspaceId: string): void {
  try {
    window.sessionStorage.removeItem(paidKey(workspaceId));
  } catch {
    /* storage unavailable */
  }
}
