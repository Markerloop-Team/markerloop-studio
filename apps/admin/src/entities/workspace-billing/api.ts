import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/shared/lib/api/client";

import type {
  CheckoutPayload,
  CheckoutSession,
  PortalSession,
  WorkspaceBilling,
} from "./model";

/**
 * The billing plane of a workspace (SDL-748): collections-service through
 * the gateway. A session call — the workspace is in the path.
 */
export const workspaceBillingApi = {
  get: (workspaceId: string): Promise<WorkspaceBilling> =>
    apiClient.get<WorkspaceBilling>(`/v1/workspaces/${workspaceId}/billing`),
  /**
   * Creates a Paddle transaction, or returns the pending one when it was
   * priced for the SAME period (another period → a new transaction).
   * 409 billing_already_subscribed, 409 billing_checkout_in_progress (another
   * request of this workspace holds the checkout — re-read and retry),
   * 404 billing_disabled, 502 billing_provider_error, 403 — not the payer.
   */
  checkout: (
    workspaceId: string,
    payload: CheckoutPayload
  ): Promise<CheckoutSession> =>
    apiClient.post<CheckoutSession>(
      `/v1/workspaces/${workspaceId}/billing/checkout`,
      payload
    ),
  /**
   * A one-off Paddle customer-portal session (SDL-749) — the payer only.
   * 403 not the payer, 409 billing_no_subscription, 404 billing_disabled,
   * 502 billing_provider_error. The links are single-use: not cached.
   */
  portal: (workspaceId: string): Promise<PortalSession> =>
    apiClient.post<PortalSession>(
      `/v1/workspaces/${workspaceId}/billing/portal`,
      {}
    ),
};


export const workspaceBillingKeys = {
  all: ["workspace-billing"] as const,
  detail: (workspaceId: string) =>
    [...workspaceBillingKeys.all, workspaceId] as const,
};

/**
 * The plan of a workspace. `pollMs` > 0 re-reads it on that interval — the
 * screen does it only while a payment waits for the Paddle webhook.
 * `staleTime: 0`: the answer changes behind the screen's back (the webhook).
 */
export function useWorkspaceBilling(
  workspaceId: string | null | undefined,
  options: { pollMs?: number } = {}
) {
  const pollMs = options.pollMs ?? 0;
  return useQuery({
    queryKey: workspaceBillingKeys.detail(workspaceId ?? ""),
    queryFn: () => workspaceBillingApi.get(workspaceId as string),
    enabled: !!workspaceId,
    staleTime: 0,
    retry: false,
    refetchInterval: pollMs > 0 ? pollMs : false,
  });
}
