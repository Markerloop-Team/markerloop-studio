import { apiClient } from "./client";

/**
 * OAuth for MCP agents (SDL-693, EP-20) — the admin's side of auth-service's
 * authorization server (SDL-691/692).
 *
 * Every call here carries the SESSION token (no `workspaceId` in the config):
 * auth-service refuses a workspace token on consent with 400
 * `session_token_required`, because the person may pick another workspace.
 *
 * Consent contract (auth-service `internal/handlers/oauth_authorize_handler.go`,
 * published by the gateway in `internal/routes/routes.go`):
 *  - GET  /v1/oauth/authorize/requests/:request_id → OAuthAuthRequestView;
 *    404 `authorization_request_not_found` once it expired (10 min) or was decided.
 *  - POST /v1/oauth/authorize/approve {request_id, workspace_id} → {redirect_to};
 *    403 `not_a_member`, 409 `authorization_request_decided`, 503 `membership_unavailable`.
 *  - POST /v1/oauth/authorize/deny {request_id} → {redirect_to}.
 *
 * Grants (Connected agents): NOT in auth-service yet (3 Oct 2026) — the store
 * (`internal/services/oauth_grants.go`) keeps `last_used_at`, but no
 * user-facing handler lists or revokes a grant and the gateway publishes
 * neither route. The shape below is what the screen needs; until the backend
 * ships it the section answers "unavailable" on the gateway's 404.
 */

export interface OAuthAuthRequest {
  request_id: string;
  client_id: string;
  /** Self-declared by the client at dynamic registration — not verified. */
  client_name?: string;
  redirect_host: string;
  resource: string;
  scope?: string;
  expires_at: string;
}

export interface OAuthDecision {
  redirect_to: string;
}

export interface OAuthGrant {
  grant_id: string;
  client_id: string;
  client_name?: string;
  workspace_id: string;
  created_at: string;
  last_used_at?: string | null;
  expires_at?: string;
}

export const oauthConsentApi = {
  getRequest: (requestId: string): Promise<OAuthAuthRequest> =>
    apiClient.get<OAuthAuthRequest>(
      `/v1/oauth/authorize/requests/${encodeURIComponent(requestId)}`
    ),
  approve: (requestId: string, workspaceId: string): Promise<OAuthDecision> =>
    apiClient.post<OAuthDecision>("/v1/oauth/authorize/approve", {
      request_id: requestId,
      workspace_id: workspaceId,
    }),
  deny: (requestId: string): Promise<OAuthDecision> =>
    apiClient.post<OAuthDecision>("/v1/oauth/authorize/deny", {
      request_id: requestId,
    }),
};

export const oauthGrantsApi = {
  list: async (): Promise<OAuthGrant[]> => {
    const data = await apiClient.get<OAuthGrant[] | null>("/v1/oauth/grants");
    return Array.isArray(data) ? data : [];
  },
  revoke: (grantId: string): Promise<void> =>
    apiClient.delete<void>(`/v1/oauth/grants/${encodeURIComponent(grantId)}`),
};
