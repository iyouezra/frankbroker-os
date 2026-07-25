"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Role } from "../../../lib/frank";
import {
  BROKER_TENANT_ID,
  fallbackCrmThreads,
  type CrmThreadDetail,
  type CrmThreadSummary,
  type CrmThreadsResponse,
} from "../shared/broker-foundation";
import type { ThreadFilters } from "./thread-list";

/**
 * Data access for the conversation surfaces. Kept out of the screens so the
 * inbox and the Client 360 tab share one implementation, and so every fetch
 * keeps the project's offline fallback behaviour.
 */

export const emptyFilters: ThreadFilters = { status: "open_all", category: "", priority: "", assigned: "", query: "" };

const headers = (role: Role) => ({ "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role });

function filterFallback(filters: ThreadFilters, clientId?: string): CrmThreadSummary[] {
  const search = filters.query.trim().toLowerCase();
  return fallbackCrmThreads.filter((thread) => {
    if (clientId && thread.client?.id !== clientId) return false;
    if (filters.status === "open_all" && !["open", "pending_broker", "pending_client"].includes(thread.status)) return false;
    if (filters.status && filters.status !== "open_all" && thread.status !== filters.status) return false;
    if (filters.category && thread.category !== filters.category) return false;
    if (filters.priority && thread.priority !== filters.priority) return false;
    if (filters.assigned === "unassigned" && thread.assignedToUserId) return false;
    if (!search) return true;
    return [thread.subject, thread.id, thread.relatedId ?? "", thread.client?.name ?? "", thread.client?.code ?? ""]
      .some((field) => field.toLowerCase().includes(search));
  });
}

export function useThreadList(role: Role, filters: ThreadFilters, clientId?: string) {
  const [threads, setThreads] = useState<CrmThreadSummary[]>([]);
  const [facets, setFacets] = useState({ unreadThreads: 0, mine: 0, unassigned: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  const search = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.category) params.set("category", filters.category);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.assigned) params.set("assigned", filters.assigned);
    if (filters.query.trim()) params.set("query", filters.query.trim());
    if (clientId) params.set("clientId", clientId);
    return params.toString();
  }, [filters, clientId]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/crm/threads?${search}`, { signal: controller.signal, headers: headers(role) });
        if (!response.ok) throw new Error("Conversations unavailable");
        const data = (await response.json()) as CrmThreadsResponse;
        setThreads(data.threads);
        setFacets(data.facets);
      } catch {
        // Offline demonstration data keeps the inbox usable without a database.
        const rows = filterFallback(filters, clientId);
        setThreads(rows);
        setFacets({ unreadThreads: rows.filter((row) => row.unread > 0).length, mine: 0, unassigned: rows.filter((row) => !row.assignedToUserId).length });
      } finally {
        setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, search, refreshKey]);

  return { threads, facets, loading, refresh };
}

export function useThreadDetail(role: Role, threadId: string | null, refreshToken: number) {
  const [thread, setThread] = useState<CrmThreadDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      if (!threadId) { setThread(null); return; }
      setLoading(true);
      try {
        const response = await fetch(`/api/crm/threads/${encodeURIComponent(threadId)}`, { signal: controller.signal, headers: headers(role) });
        if (!response.ok) throw new Error("Conversation unavailable");
        const data = (await response.json()) as { thread: CrmThreadDetail };
        setThread(data.thread);
      } catch {
        setThread(fallbackCrmThreads.find((item) => item.id === threadId) ?? null);
      } finally {
        setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [role, threadId, refreshToken]);

  return { thread, loading };
}

/** Posts a thread action, sending multipart only when files are attached. */
export async function postThreadAction(role: Role, threadId: string, action: string, payload: Record<string, unknown>, files: File[] = []) {
  const url = `/api/crm/threads/${encodeURIComponent(threadId)}/action`;
  const body = { action, ...payload };
  let init: RequestInit;
  if (files.length) {
    const formData = new FormData();
    formData.set("payload", JSON.stringify(body));
    files.forEach((file, index) => formData.set(`attachment${index}`, file));
    init = { method: "POST", headers: headers(role), body: formData };
  } else {
    init = { method: "POST", headers: { ...headers(role), "content-type": "application/json" }, body: JSON.stringify(body) };
  }
  const response = await fetch(url, init);
  const result = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(result.error || "The conversation could not be updated.");
  return result;
}
