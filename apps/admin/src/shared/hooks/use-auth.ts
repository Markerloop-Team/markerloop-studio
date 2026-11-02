"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuthStore } from "@/shared/store/auth-store";
import { apiClient } from "@/shared/lib/api/client";
import type { User } from "@/entities/user/model";

interface UserAccessResponse {
  roles: string[];
  permissions: string[];
}

async function getCurrentUser(): Promise<User> {
  return apiClient.get<User>("/v1/users/my");
}

async function getMyAccess(): Promise<UserAccessResponse> {
  return apiClient.get<UserAccessResponse>("/v1/users/my/access");
}

export function useAuth() {
  const {
    isAuthenticated,
    userId,
    permissions,
    roles,
    setAuthenticated,
    setPermissionsAndRoles,
  } = useAuthStore();

  const {
    data: user,
    isLoading: isUserLoading,
    error,
  } = useQuery({
    queryKey: ["user", "me"],
    queryFn: getCurrentUser,
    enabled: isAuthenticated,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const { data: accessData, isLoading: isAccessLoading } = useQuery({
    queryKey: ["user", "my-access"],
    queryFn: getMyAccess,
    enabled: isAuthenticated,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (user) {
      setAuthenticated(user.id);
    }
  }, [user, setAuthenticated]);

  useEffect(() => {
    if (accessData) {
      setPermissionsAndRoles(accessData.permissions, accessData.roles);
    }
  }, [accessData, setPermissionsAndRoles]);

  useEffect(() => {
    if (error) {
      console.error("[useAuth] User query failed:", error);
    }
  }, [error]);

  return {
    isAuthenticated,
    userId,
    user,
    permissions,
    roles,
    isLoading: isUserLoading || isAccessLoading,
  };
}

/**
 * The signed-in person only — the same query as `useAuth` (["user", "me"]),
 * without its side effects on the auth store. For widgets that just print who
 * is signed in (the shell's account menu): writing roles and permissions from
 * several places is how a half-read access answer reached the store.
 */
export function useCurrentUser(): User | undefined {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: ["user", "me"],
    queryFn: getCurrentUser,
    enabled: isAuthenticated,
    retry: false,
    staleTime: 5 * 60 * 1000,
  }).data;
}
