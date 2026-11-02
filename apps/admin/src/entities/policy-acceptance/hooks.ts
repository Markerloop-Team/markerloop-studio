"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { policyAcceptancesApi } from "./api/policy-acceptances-api";
import type { PolicyJournalQuery } from "./model/types";

export const policyAcceptanceKeys = {
  all: ["policy-acceptances"] as const,
  list: (q: PolicyJournalQuery) => ["policy-acceptances", "list", q] as const,
  summary: () => ["policy-acceptances", "summary"] as const,
  user: (userId: string) => ["policy-acceptances", "user", userId] as const,
};

/** A 4xx will not change on a retry; only a transient failure is retried. */
function retryTransient(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (typeof status === "number" && status >= 400 && status < 500) return false;
  return failureCount < 1;
}

// The journal is append-only audit data read on purpose: short freshness so a
// reopened screen shows new acceptances, no polling.
const STALE_MS = 30_000;

export function usePolicyJournal(query: PolicyJournalQuery, enabled = true) {
  return useQuery({
    queryKey: policyAcceptanceKeys.list(query),
    queryFn: () => policyAcceptancesApi.list(query),
    placeholderData: keepPreviousData,
    staleTime: STALE_MS,
    retry: retryTransient,
    enabled,
  });
}

export function usePolicySummary(enabled = true) {
  return useQuery({
    queryKey: policyAcceptanceKeys.summary(),
    queryFn: () => policyAcceptancesApi.summary(),
    staleTime: STALE_MS,
    retry: retryTransient,
    enabled,
  });
}

export function useUserPolicyAcceptances(userId: string, enabled = true) {
  return useQuery({
    queryKey: policyAcceptanceKeys.user(userId),
    queryFn: () => policyAcceptancesApi.userHistory(userId),
    staleTime: STALE_MS,
    retry: retryTransient,
    enabled: enabled && Boolean(userId),
  });
}
