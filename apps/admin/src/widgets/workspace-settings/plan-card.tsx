"use client";

import * as React from "react";
import { CreditCard, ExternalLink, Loader2, Lock } from "lucide-react";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import type {
  BillingPeriod,
  BillingSubscriptionStatus,
} from "@/entities/workspace-billing";

import type { PlanNotice, PlanState, PortalFailure } from "./plan-machine";
import { SettingsCard, SettingsRow } from "./settings-card";

/**
 * The plan card of the workspace settings (SDL-748, EP-146) — ONE component
 * for the approved canvas `/design-system/billing` and the live «Plan» tab.
 * The canvas renders it with fixed data; the live tab feeds it from
 * GET …/billing. Moved here from `app/design-system/_canvas/billing-parts`
 * so the two cannot drift. No colour of its own: kit components only.
 */

/** Prices — the owner's decision (EP-140): one plan per workspace. */
export const PLAN_PRICES: Record<BillingPeriod, number> = { month: 19, year: 180 };
/** The yearly saving in words, not «−21%»: 12 × $19 = $228, a year is $180. */
export const YEAR_SAVING = PLAN_PRICES.month * 12 - PLAN_PRICES.year;
const YEAR_PER_MONTH = PLAN_PRICES.year / 12;

export interface PlanProDetails {
  period: BillingPeriod | "";
  status: BillingSubscriptionStatus;
  /** Who pays, already in words («You», the owner's name). */
  payer: string;
  /** Next charge, already formatted. The live API has none yet: no row. */
  renewsOn?: string;
  /**
   * SDL-749: a cancellation is scheduled — the last day of Pro, already
   * formatted. Replaces «Renews on».
   */
  cancelAt?: string | null;
  /**
   * SDL-749: the card failed (past_due) — the last day of the grace period,
   * already formatted.
   */
  graceUntil?: string | null;
}

/**
 * SDL-749: the Paddle customer portal — only for the payer of a workspace
 * that has a Paddle customer (`has_subscription`). `target` says which link
 * of the one-off session to follow: the portal home or «update card».
 */
export type PortalTarget = "portal" | "payment";

export interface PlanManage {
  onOpen?: (target: PortalTarget) => void;
  /** The session being created — its button is busy, both are disabled. */
  busy?: PortalTarget | null;
  error?: PortalFailure | null;
}

export function PlanCard({
  state,
  workspaceName,
  ownerName,
  period,
  onPeriodChange,
  onUpgrade,
  slow = false,
  notice = null,
  pro,
  manage = null,
  canPay = true,
}: {
  state: PlanState;
  workspaceName: string;
  /** null → «the owner». */
  ownerName: string | null;
  period: BillingPeriod;
  onPeriodChange: (period: BillingPeriod) => void;
  onUpgrade?: () => void;
  /** processing only: the webhook is late, say so calmly. */
  slow?: boolean;
  /** free only: a calm line under the button (see `PlanNotice`). */
  notice?: PlanNotice | null;
  pro?: PlanProDetails;
  /** SDL-749: null → no portal (not the payer, or no Paddle customer). */
  manage?: PlanManage | null;
  /** SDL-749: false → the grace text names the payer instead of «update your card». */
  canPay?: boolean;
}) {
  const t = useTranslations("workspaceBilling");
  const isPro = state === "pro";
  const lapsed = state === "past_due";
  const pending = state === "processing";
  const upgrade =
    state === "free" ||
    state === "creating" ||
    state === "checkout" ||
    state === "error" ||
    state === "disabled";

  return (
    <UI.Box direction="column" gap={6} data-testid="plan" data-state={state}>
      <SettingsCard
        testid="plan-card"
        title={t("card.title")}
        description={t("card.description", { workspace: workspaceName })}
      >
        <SettingsRow
          testid="plan-current"
          title={t("current.title")}
          description={
            isPro
              ? t("current.pro")
              : pending
                ? t("current.pending")
                : lapsed
                  ? t("current.lapsed")
                  : state === "member"
                  ? t("current.member")
                  : t("current.free")
          }
          action={
            <UI.Box direction="row" gap={2} align="center">
              <UI.Badge
                variant={isPro ? "default" : "secondary"}
                data-testid="plan-badge"
              >
                {isPro ? t("badge.pro") : t("badge.free")}
              </UI.Badge>
              {pending ? (
                <UI.Badge variant="outline" data-testid="plan-badge-pending">
                  {t("badge.pending")}
                </UI.Badge>
              ) : null}
            </UI.Box>
          }
        />

        {upgrade ? (
          <UpgradeBlock
            period={period}
            onPeriodChange={onPeriodChange}
            onUpgrade={onUpgrade}
            busy={state === "creating" || state === "checkout"}
            failed={state === "error"}
            disabled={state === "disabled"}
            notice={state === "free" ? notice : null}
          />
        ) : null}
        {pending ? (
          <ProcessingNotice workspaceName={workspaceName} slow={slow} />
        ) : null}
        {isPro && pro?.graceUntil ? (
          <PaymentFailedNotice
            testid="plan-grace"
            title={t("grace.title")}
            body={
              canPay
                ? t("grace.body", { date: pro.graceUntil })
                : t("grace.memberBody", {
                    date: pro.graceUntil,
                    owner: ownerName ?? t("member.ownerFallback"),
                  })
            }
            manage={manage}
          />
        ) : null}
        {lapsed ? (
          <PaymentFailedNotice
            testid="plan-lapsed"
            title={t("lapsed.title")}
            body={t("lapsed.body")}
            manage={manage}
          />
        ) : null}
        {isPro && pro ? <ProRows pro={pro} /> : null}
        {manage ? <ManageRow manage={manage} /> : null}
        {state === "member" ? (
          <UI.Box className="px-4 py-3" data-testid="plan-member-hint">
            <UI.Text as="p" size="sm" variant="muted">
              {t("member.hint", { owner: ownerName ?? t("member.ownerFallback") })}
            </UI.Text>
          </UI.Box>
        ) : null}
      </SettingsCard>
    </UI.Box>
  );
}

/**
 * Period and the pay button — the payer on Free only. The period is picked
 * BEFORE the button: the backend creates the transaction at that period's
 * price, and the Paddle window cannot change it.
 */
function UpgradeBlock({
  period,
  onPeriodChange,
  onUpgrade,
  busy,
  failed,
  disabled,
  notice,
}: {
  period: BillingPeriod;
  onPeriodChange: (period: BillingPeriod) => void;
  onUpgrade?: () => void;
  busy: boolean;
  failed: boolean;
  disabled: boolean;
  notice: PlanNotice | null;
}) {
  const t = useTranslations("workspaceBilling");
  const off = busy || disabled;

  return (
    <UI.Box direction="column" gap={4} className="px-4 py-4" data-testid="plan-upgrade">
      <UI.Box direction="row" align="center" gap={3} wrap>
        <UI.Box direction="column" grow className="min-w-[12rem]">
          <UI.Text as="span" size="sm" weight="medium">
            {t("upgrade.title")}
          </UI.Text>
          <UI.Text as="div" size="sm" variant="muted" data-testid="plan-saving">
            {t("upgrade.saving", {
              saving: YEAR_SAVING,
              perMonth: YEAR_PER_MONTH,
              monthly: PLAN_PRICES.month,
            })}
          </UI.Text>
        </UI.Box>
        <UI.ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={period}
          disabled={off}
          onValueChange={(value) =>
            value === "month" || value === "year" ? onPeriodChange(value) : undefined
          }
          aria-label={t("upgrade.periodLabel")}
          data-testid="plan-period"
        >
          <UI.ToggleGroup.Item value="month" data-testid="plan-period-month">
            {t("upgrade.monthly")}
          </UI.ToggleGroup.Item>
          <UI.ToggleGroup.Item value="year" data-testid="plan-period-year">
            {t("upgrade.yearly")}
          </UI.ToggleGroup.Item>
        </UI.ToggleGroup>
      </UI.Box>

      <UI.Box direction="row" align="center" gap={3} wrap>
        <UI.Text as="span" size="2xl" weight="semibold" data-testid="plan-price">
          {t(`price.${period}`, { amount: PLAN_PRICES[period] })}
        </UI.Text>
        <UI.Box grow />
        <UI.Button
          disabled={off}
          aria-busy={busy ? "true" : "false"}
          onClick={off ? undefined : onUpgrade}
          data-testid="plan-upgrade-button"
        >
          {busy ? (
            <Loader2 size={16} aria-hidden="true" className="animate-spin" />
          ) : (
            <CreditCard size={16} aria-hidden="true" />
          )}
          {busy
            ? t("upgrade.opening")
            : failed
              ? t("upgrade.retry")
              : t("upgrade.button")}
        </UI.Button>
      </UI.Box>

      {failed ? (
        <UI.Alert variant="destructive" data-testid="plan-error">
          <UI.Text as="p" size="sm" weight="medium">
            {t("error.title")}
          </UI.Text>
          <UI.Text as="p" size="sm">
            {t("error.body")}
          </UI.Text>
        </UI.Alert>
      ) : null}

      {notice ? (
        <UI.Text
          as="p"
          size="sm"
          variant="muted"
          data-testid="plan-notice"
          data-reason={notice}
        >
          {t(`notice.${notice}`, {
            price: t(`price.${period}`, { amount: PLAN_PRICES[period] }),
          })}
        </UI.Text>
      ) : null}

      {disabled ? (
        <UI.Alert data-testid="plan-disabled">
          <UI.Text as="p" size="sm" weight="medium">
            {t("disabled.title")}
          </UI.Text>
          <UI.Text as="p" size="sm">
            {t("disabled.body")}
          </UI.Text>
        </UI.Alert>
      ) : null}

      <UI.Text as="div" size="xs" variant="muted" data-testid="plan-paddle-note">
        <UI.Box direction="row" gap={2} align="start">
          <Lock size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{t("paddleNote")}</span>
        </UI.Box>
      </UI.Text>
    </UI.Box>
  );
}

/**
 * Back from Paddle: paid, the webhook has not arrived. Neither success nor
 * error. No Upgrade button here — a second click would be a second
 * transaction. Since SDL-748 the wait is kept on the server
 * (`pending_checkout`), so a reload lands here too. Late webhook (`slow`) →
 * a calm «being confirmed», never a payment error.
 */
function ProcessingNotice({
  workspaceName,
  slow,
}: {
  workspaceName: string;
  slow: boolean;
}) {
  const t = useTranslations("workspaceBilling");
  return (
    <UI.Box className="px-4 py-3">
      <UI.Alert data-testid="plan-processing" data-slow={slow ? "true" : "false"}>
        <UI.Box direction="row" gap={3} align="start">
          {slow ? null : (
            <Loader2
              size={16}
              aria-hidden="true"
              className="mt-0.5 shrink-0 animate-spin"
            />
          )}
          <UI.Box direction="column" gap={1}>
            <UI.Text as="p" size="sm" weight="medium">
              {slow ? t("processing.slowTitle") : t("processing.title")}
            </UI.Text>
            <UI.Text as="p" size="sm">
              {slow
                ? t("processing.slowBody")
                : t("processing.body", { workspace: workspaceName })}
            </UI.Text>
          </UI.Box>
        </UI.Box>
      </UI.Alert>
    </UI.Box>
  );
}

/** Pro: period and price, the subscription state when it is not plain «active», who pays. */
function ProRows({ pro }: { pro: PlanProDetails }) {
  const t = useTranslations("workspaceBilling");
  // A scheduled cancellation and a failing card each have their own block;
  // the generic status row would only repeat them.
  const showStatus =
    pro.status !== "" &&
    pro.status !== "active" &&
    !(pro.status === "past_due" && pro.graceUntil);
  return (
    <>
      {pro.period ? (
        <SettingsRow
          testid="plan-period-row"
          title={t("pro.period")}
          description={pro.period === "year" ? t("upgrade.yearly") : t("upgrade.monthly")}
          action={
            <UI.Text as="span" size="sm" weight="medium">
              {t(`price.${pro.period}`, { amount: PLAN_PRICES[pro.period] })}
            </UI.Text>
          }
        />
      ) : null}
      {showStatus ? (
        <SettingsRow
          testid="plan-status"
          title={t("pro.status")}
          description={t(`pro.statusHint.${pro.status}`)}
          action={
            <UI.Badge
              variant={pro.status === "past_due" ? "destructive" : "outline"}
              data-testid="plan-status-badge"
            >
              {t(`pro.statuses.${pro.status}`)}
            </UI.Badge>
          }
        />
      ) : null}
      {pro.cancelAt ? (
        // No «Resume»: whether Paddle's portal can take a scheduled
        // cancellation back was never checked — the row only points there
        // through «Manage billing» below.
        <SettingsRow
          testid="plan-cancel"
          title={t("cancel.title")}
          description={t("cancel.description", { date: pro.cancelAt })}
          action={
            <UI.Text as="span" size="sm" weight="medium">
              {pro.cancelAt}
            </UI.Text>
          }
        />
      ) : null}
      {pro.renewsOn && !pro.cancelAt && !pro.graceUntil ? (
        <SettingsRow
          testid="plan-renews"
          title={t("pro.renewsTitle")}
          description={t("pro.renewsDescription")}
          action={
            <UI.Text as="span" size="sm" weight="medium">
              {pro.renewsOn}
            </UI.Text>
          }
        />
      ) : null}
      <SettingsRow
        testid="plan-payer"
        title={t("pro.paidBy")}
        description={t("pro.paidByDescription")}
        action={
          <UI.Text as="span" size="sm" weight="medium">
            {pro.payer}
          </UI.Text>
        }
      />
    </>
  );
}

/**
 * SDL-749: one button that opens a one-off Paddle portal session. Busy
 * while ITS session is being created; both portal buttons are off meanwhile
 * so a second click does not create a second session.
 */
function PortalButton({
  target,
  manage,
  variant,
  testid,
  label,
}: {
  target: PortalTarget;
  manage: PlanManage;
  variant: "default" | "outline";
  testid: string;
  label: string;
}) {
  const t = useTranslations("workspaceBilling");
  const busy = manage.busy === target;
  const off = !!manage.busy || !manage.onOpen;
  return (
    <UI.Button
      variant={variant}
      size="sm"
      disabled={off}
      aria-busy={busy ? "true" : "false"}
      onClick={off ? undefined : () => manage.onOpen?.(target)}
      data-testid={testid}
    >
      {busy ? (
        <Loader2 size={16} aria-hidden="true" className="animate-spin" />
      ) : (
        <ExternalLink size={16} aria-hidden="true" />
      )}
      {busy ? t("manage.opening") : label}
    </UI.Button>
  );
}

/**
 * SDL-749: «Manage billing» — card, invoices and cancellation live in the
 * Paddle customer portal; a refusal is a sentence under it, never a crash.
 */
function ManageRow({ manage }: { manage: PlanManage }) {
  const t = useTranslations("workspaceBilling");
  return (
    <>
      <SettingsRow
        testid="plan-manage"
        title={t("manage.title")}
        description={t("manage.description")}
        action={
          <PortalButton
            target="portal"
            manage={manage}
            variant="outline"
            testid="plan-manage-button"
            label={t("manage.button")}
          />
        }
      />
      {manage.error ? (
        <UI.Box className="px-4 py-3">
          <UI.Alert
            variant={manage.error === "failed" ? "destructive" : "default"}
            data-testid="plan-manage-error"
            data-reason={manage.error}
          >
            <UI.Text as="p" size="sm" weight="medium">
              {t(`manage.errors.${manage.error}.title`)}
            </UI.Text>
            <UI.Text as="p" size="sm">
              {t(`manage.errors.${manage.error}.body`)}
            </UI.Text>
          </UI.Alert>
        </UI.Box>
      ) : null}
    </>
  );
}

/**
 * SDL-749: the card failed. During the grace period Pro stays until the
 * date; after it the workspace is Free (`lapsed`). Either way the way out is
 * the «update card» link of the portal — never a second checkout.
 */
function PaymentFailedNotice({
  testid,
  title,
  body,
  manage,
}: {
  testid: string;
  title: string;
  body: string;
  manage: PlanManage | null;
}) {
  const t = useTranslations("workspaceBilling");
  return (
    <UI.Box className="px-4 py-3">
      <UI.Alert variant="destructive" data-testid={testid}>
        <UI.Box direction="column" gap={3}>
          <UI.Box direction="column" gap={1}>
            <UI.Text as="p" size="sm" weight="medium">
              {title}
            </UI.Text>
            <UI.Text as="p" size="sm">
              {body}
            </UI.Text>
          </UI.Box>
          {manage ? (
            <UI.Box direction="row">
              <PortalButton
                target="payment"
                manage={manage}
                variant="default"
                testid="plan-update-card"
                label={t("grace.button")}
              />
            </UI.Box>
          ) : null}
        </UI.Box>
      </UI.Alert>
    </UI.Box>
  );
}
