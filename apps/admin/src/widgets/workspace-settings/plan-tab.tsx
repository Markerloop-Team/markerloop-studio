"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import { useWorkspaceMembers } from "@/entities/collections/member";
import {
  initPaddle,
  loadPaddle,
  setPaddleListener,
  useWorkspaceBilling,
  workspaceBillingApi,
  workspaceBillingKeys,
  type BillingPeriod,
  type CheckoutSession,
  type PaddleEvent,
} from "@/entities/workspace-billing";
import type { Workspace } from "@/widgets/collections";

import { PlanCard, type PortalTarget } from "./plan-card";
import {
  INITIAL_PLAN_PHASE,
  PAID_TTL_MS,
  checkoutFailureOf,
  forgetPaidTransaction,
  formatBillingDate,
  portalFailureOf,
  type PortalFailure,
  isSafeCheckoutUrl,
  isSafePortalUrl,
  paidTransaction,
  planReducer,
  planStateOf,
  rememberPaidTransaction,
} from "./plan-machine";

/** Re-read the plan this often while a payment waits for the webhook. */
export const PLAN_POLL_MS = 3000;
/** After this long the wait is «being confirmed, refresh later». */
export const PLAN_POLL_TIMEOUT_MS = 120_000;

const goTo = (url: string) => window.location.assign(url);

/**
 * «Plan» tab, wired (SDL-748, EP-146) — the canvas `/design-system/billing`
 * over GET/POST /v1/workspaces/:id/billing and Paddle.js.
 *
 * Upgrade → POST checkout (button busy, a second click is dropped) → Paddle.js
 * loaded once, lazily → overlay by `transaction_id`. `checkout.completed` of
 * THAT transaction → «Activating Pro…» and the plan is re-read every 3 s until
 * it is Pro (2 min, then a calm «being confirmed»). `checkout.closed` without
 * paying → back to Free (the server keeps its pending; the next click with the
 * same period gets the same transaction). A pending checkout on load is
 * «started», not «paid»: the button stays, with a line saying so. No
 * `client_token` but an https `checkout_url` → that page instead.
 */
export function WorkspacePlanTab({
  workspace,
  currentUserId,
  pollMs = PLAN_POLL_MS,
  timeoutMs = PLAN_POLL_TIMEOUT_MS,
  navigate = goTo,
  paidTtlMs = PAID_TTL_MS,
}: {
  workspace: Workspace;
  currentUserId: string | null;
  pollMs?: number;
  timeoutMs?: number;
  /** Leaves for Paddle's hosted page (the fallback); swapped in the smoke. */
  navigate?: (url: string) => void;
  /** How long a payment seen in this tab hides the button; swapped in the smoke. */
  paidTtlMs?: number;
}) {
  const t = useTranslations("workspaceBilling");
  const locale = useLocale();
  /** SDL-749: the portal session being created, and why the last one was refused. */
  const [portalBusy, setPortalBusy] = React.useState<PortalTarget | null>(null);
  const [portalError, setPortalError] = React.useState<PortalFailure | null>(null);
  const portalPending = React.useRef(false);
  const qc = useQueryClient();
  const [phase, dispatch] = React.useReducer(planReducer, INITIAL_PLAN_PHASE);
  const [period, setPeriod] = React.useState<BillingPeriod>("month");
  const busy = React.useRef(false);
  const completed = React.useRef(false);
  /** The transaction the Paddle window was opened for. */
  const openTx = React.useRef<string | null>(null);
  const loaded = React.useRef(false);
  /** When the payment this tab trusts was seen (epoch ms), or null. */
  const paidAt = React.useRef<number | null>(null);

  const polling = phase.kind === "processing" && !phase.slow;
  const billingQuery = useWorkspaceBilling(workspace.id, {
    pollMs: polling ? pollMs : 0,
  });
  const billing = billingQuery.data;

  const isOwner = currentUserId !== null && currentUserId === workspace.owner_user_id;
  // The owner's name for a member's hint; the list is the one the Members
  // tab reads, so it is usually cached already.
  const membersQuery = useWorkspaceMembers(
    billing && !billing.can_pay ? workspace.id : null,
    "profiles"
  );
  const ownerName =
    membersQuery.data?.find((m) => m.user_id === workspace.owner_user_id)
      ?.username ?? null;

  const refresh = React.useCallback(
    () =>
      qc.invalidateQueries({ queryKey: workspaceBillingKeys.detail(workspace.id) }),
    [qc, workspace.id]
  );

  // A pending checkout is «started», not «paid»: it keeps the button. Only
  // a payment THIS tab saw (the record written on checkout.completed, fresh)
  // means «Activating Pro…» after a reload — with or without a pending: the
  // backend drops the pending before Pro arrives. The period switch starts at
  // the pending transaction's period, so a repeat gets the same transaction.
  React.useEffect(() => {
    if (!billing) return;
    if (billing.plan === "pro") {
      forgetPaidTransaction(workspace.id);
      paidAt.current = null;
      dispatch({ type: "settled" });
      return;
    }
    const pending = billing.pending_checkout;
    if (!loaded.current) {
      loaded.current = true;
      if (pending?.period === "month" || pending?.period === "year") {
        setPeriod(pending.period);
      }
    }
    const paid = paidTransaction(workspace.id, paidTtlMs);
    if (paid) {
      paidAt.current = paid.saved_at;
      dispatch({ type: "resume" });
    }
  }, [billing, paidTtlMs, workspace.id]);

  // «Activating Pro…» — and no button — only while the payment is trusted;
  // a payment that never became Pro gives the button back after the TTL.
  const processing = phase.kind === "processing";
  React.useEffect(() => {
    if (!processing || paidAt.current === null) return;
    const left = paidAt.current + paidTtlMs - Date.now();
    const timer = window.setTimeout(() => {
      forgetPaidTransaction(workspace.id);
      paidAt.current = null;
      dispatch({ type: "expired" });
    }, Math.max(0, left));
    return () => window.clearTimeout(timer);
  }, [processing, paidTtlMs, workspace.id]);

  React.useEffect(() => {
    if (!polling) return;
    const timer = window.setTimeout(() => dispatch({ type: "timeout" }), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [polling, timeoutMs]);

  React.useEffect(() => {
    const onEvent = (event: PaddleEvent) => {
      if (event.name === "checkout.completed") {
        // Only the transaction this tab opened; anything else is not ours.
        const tx = event.data?.transaction_id;
        if (!openTx.current || tx !== openTx.current) return;
        completed.current = true;
        paidAt.current = Date.now();
        rememberPaidTransaction(workspace.id, tx, paidAt.current);
        dispatch({ type: "completed" });
        void refresh();
      } else if (event.name === "checkout.closed" && !completed.current) {
        dispatch({ type: "closed" });
      }
    };
    setPaddleListener(onEvent);
    return () => setPaddleListener(null);
  }, [refresh, workspace.id]);

  const upgrade = React.useCallback(async () => {
    if (busy.current || !billing) return;
    busy.current = true;
    completed.current = false;
    openTx.current = null;
    dispatch({ type: "upgrade" });
    let session: CheckoutSession | null = null;
    try {
      session = await workspaceBillingApi.checkout(workspace.id, {
        plan: "pro",
        period,
      });
      if (session.period && session.period !== period) {
        // The price of the transaction is not the one on screen: show the
        // real one and let the person press again — never open Paddle on a
        // price they did not see.
        setPeriod(session.period);
        dispatch({ type: "notice", reason: "period" });
        return;
      }
      if (!billing.client_token) {
        if (!isSafeCheckoutUrl(session.checkout_url)) {
          throw new Error("checkout_unavailable");
        }
        navigate(session.checkout_url);
        return;
      }
      const paddle = await loadPaddle();
      initPaddle(paddle, {
        token: billing.client_token,
        environment: session.environment || billing.environment,
      });
      openTx.current = session.transaction_id;
      paddle.Checkout.open({ transactionId: session.transaction_id });
      dispatch({ type: "opened" });
    } catch (error) {
      if (session) {
        // The transaction exists; only Paddle.js failed. Its hosted page is
        // the way out when there is one.
        if (isSafeCheckoutUrl(session.checkout_url)) {
          navigate(session.checkout_url);
          return;
        }
        dispatch({ type: "failed" });
        return;
      }
      switch (checkoutFailureOf(error)) {
        case "subscribed":
        case "forbidden":
        case "past_due":
          // Already Pro / no longer the payer: the server's answer decides.
          dispatch({ type: "reset" });
          void refresh();
          break;
        case "processing":
          // Paid in another tab, Pro not set yet: wait here as after our own
          // payment. No sessionStorage record (the transaction is not ours to
          // remember) — the in-tab clock gives the button back after the TTL.
          paidAt.current = Date.now();
          dispatch({ type: "paid-elsewhere" });
          void refresh();
          break;
        case "busy":
          // Another request holds the checkout: re-read, press again.
          dispatch({ type: "notice", reason: "busy" });
          void refresh();
          break;
        case "disabled":
          dispatch({ type: "unavailable" });
          break;
        default:
          dispatch({ type: "failed" });
      }
    } finally {
      busy.current = false;
    }
  }, [billing, navigate, period, refresh, workspace.id]);

  /**
   * SDL-749: a one-off Paddle portal session, followed at once in this tab
   * (the same way as the checkout fallback) — the links are single-use, so
   * nothing is kept or cached. «Update card» follows
   * `update_payment_method_url` when Paddle gave one, else the portal home.
   */
  const openPortal = React.useCallback(
    async (target: PortalTarget) => {
      if (portalPending.current) return;
      portalPending.current = true;
      setPortalBusy(target);
      setPortalError(null);
      try {
        const session = await workspaceBillingApi.portal(workspace.id);
        const url =
          target === "payment" && isSafePortalUrl(session.update_payment_method_url)
            ? session.update_payment_method_url
            : session.url;
        if (!isSafePortalUrl(url)) throw new Error("portal_unavailable");
        navigate(url);
      } catch (error) {
        const failure = portalFailureOf(error);
        setPortalError(failure);
        // No customer / no longer the payer: the server's answer decides
        // what the card shows.
        if (failure === "no_subscription" || failure === "forbidden") void refresh();
      } finally {
        portalPending.current = false;
        setPortalBusy(null);
      }
    },
    [navigate, refresh, workspace.id]
  );

  // A refusal belongs to the billing it was given for: new data, no stale
  // sentence (react-query keeps the same object when nothing changed).
  React.useEffect(() => {
    setPortalError(null);
  }, [billing]);

  if (billingQuery.isLoading) {
    return (
      <UI.Text as="p" size="sm" variant="muted" data-testid="plan-loading">
        {t("loading")}
      </UI.Text>
    );
  }
  if (!billing) {
    return (
      <UI.Alert variant="destructive" data-testid="plan-load-error">
        <UI.Box direction="row" align="center" gap={3} wrap>
          <UI.Text as="p" size="sm" className="min-w-[12rem] grow">
            {t("loadError")}
          </UI.Text>
          <UI.Button
            variant="outline"
            size="sm"
            onClick={() => void billingQuery.refetch()}
            data-testid="plan-load-retry"
          >
            {t("upgrade.retry")}
          </UI.Button>
        </UI.Box>
      </UI.Alert>
    );
  }

  const { state, slow, notice } = planStateOf(billing, phase);
  return (
    <PlanCard
      state={state}
      slow={slow}
      notice={notice}
      workspaceName={workspace.name}
      ownerName={ownerName}
      period={period}
      onPeriodChange={setPeriod}
      onUpgrade={() => void upgrade()}
      pro={{
        period: billing.period,
        status: billing.subscription_status,
        payer: billing.can_pay || isOwner ? t("pro.you") : (ownerName ?? t("pro.owner")),
        cancelAt: formatBillingDate(billing.cancel_at, locale),
        graceUntil: formatBillingDate(billing.grace_until, locale),
      }}
      canPay={billing.can_pay}
      manage={
        billing.can_pay && billing.has_subscription
          ? {
              onOpen: (target) => void openPortal(target),
              busy: portalBusy,
              error: portalError,
            }
          : null
      }
    />
  );
}
