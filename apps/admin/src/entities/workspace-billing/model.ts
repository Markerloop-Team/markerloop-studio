/**
 * Billing of one workspace (SDL-748, EP-146) — the answer of
 * GET /v1/workspaces/:id/billing (collections-service), field for field.
 */
export type BillingPeriod = "month" | "year";
export type BillingPlan = "free" | "pro";
export type BillingSubscriptionStatus =
  | ""
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "paused";
export type BillingEnvironment = "sandbox" | "production" | "";

/**
 * A checkout STARTED and not confirmed by the Paddle webhook — «started»,
 * never «paid»: a paid transaction is not reported here. Repeating the
 * checkout with the same period returns this transaction again.
 */
export interface PendingCheckout {
  /** Empty for a person who is not the payer. */
  transaction_id: string;
  /** RFC 3339. */
  created_at: string;
  /** The period this transaction was priced for. */
  period: BillingPeriod;
}

export interface WorkspaceBilling {
  plan: BillingPlan;
  subscription_status: BillingSubscriptionStatus;
  period: BillingPeriod | "";
  /** false → the person is not the payer: no upgrade button (case member). */
  can_pay: boolean;
  /** false → payments are off on this server: the button is disabled. */
  checkout_enabled: boolean;
  environment: BillingEnvironment;
  /** Public Paddle.js token; only for the payer while checkout is enabled. */
  client_token: string;
  /** Server-side «payment in progress» — survives a reload of the tab. */
  pending_checkout: PendingCheckout | null;
  /**
   * SDL-749: the end of the paid period when a cancellation is scheduled
   * (RFC 3339, UTC); empty — no cancellation scheduled.
   */
  cancel_at?: string;
  /**
   * SDL-749: the end of the grace period (RFC 3339, UTC) — only while the
   * plan is pro and the subscription is past_due; empty otherwise.
   */
  grace_until?: string;
  /** SDL-749: the workspace has a Paddle customer — the portal can open. */
  has_subscription?: boolean;
}

export interface CheckoutPayload {
  plan: "pro";
  period: BillingPeriod;
}

/** POST /v1/workspaces/:id/billing/checkout → data. */
export interface CheckoutSession {
  transaction_id: string;
  checkout_url: string;
  environment: BillingEnvironment;
  plan: BillingPlan;
  period: BillingPeriod;
  price_id: string;
}

/**
 * POST /v1/workspaces/:id/billing/portal → data (SDL-749). One-off Paddle
 * customer-portal links: follow at once, never store or cache. The last two
 * are empty for a canceled subscription.
 */
export interface PortalSession {
  url: string;
  cancel_url: string;
  update_payment_method_url: string;
}
