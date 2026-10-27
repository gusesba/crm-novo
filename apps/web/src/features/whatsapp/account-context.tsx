"use client";
import { createContext, useContext, useMemo } from "react";
import { api, post, put } from "@/lib/api";
import { useResource } from "@/hooks/use-resource";
import { whatsappAccountPath } from "@/lib/whatsapp-account";

export const WhatsAppAccountContext = createContext({ accountId: "default", userId: "" });

export function useWhatsAppApi() {
  const { accountId } = useContext(WhatsAppAccountContext);
  return useMemo(() => {
    const path = (value: string) => whatsappAccountPath(value, accountId);
    return {
      path,
      api: <T,>(value: string, options?: RequestInit) => api<T>(path(value), options),
      post: <T,>(value: string, body?: unknown) => post<T>(path(value), body),
      put: <T,>(value: string, body: unknown) => put<T>(path(value), body),
    };
  }, [accountId]);
}

export function useWhatsAppResource<T>(value: string | null, interval?: number) {
  const { path } = useWhatsAppApi();
  return useResource<T>(value === null ? null : path(value), interval);
}
