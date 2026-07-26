"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Role } from "../../../lib/frank";
import type { MarketSnapshot } from "../../../lib/market-data/types";
import { BROKER_TENANT_ID } from "../shared/broker-foundation";

export function useMarketData(role: Role) {
  const [data, setData] = useState<MarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const failures = useRef(0);
  const inFlight = useRef(false);
  const hasData = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch("/api/market", {
        signal,
        cache: "no-store",
        headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role },
      });
      if (!response.ok) throw new Error(response.status === 403 ? "This role is not entitled to market data." : "Market data is currently unavailable.");
      setData(await response.json() as MarketSnapshot);
      hasData.current = true;
      setError(null);
      failures.current = 0;
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") {
        failures.current += 1;
        setError(caught instanceof Error ? caught.message : "Market data is currently unavailable.");
      }
    } finally {
      inFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [role]);

  useEffect(() => {
    const controller = new AbortController();
    const initialTimer = window.setTimeout(() => void load(controller.signal), 0);
    let timer = 0;
    const schedule = () => {
      const base = document.visibilityState === "visible" ? 30_000 : 120_000;
      const delay = Math.min(300_000, base * Math.max(1, 2 ** failures.current));
      timer = window.setTimeout(async () => { await load(controller.signal); schedule(); }, delay);
    };
    schedule();
    return () => { controller.abort(); window.clearTimeout(initialTimer); window.clearTimeout(timer); };
  }, [load]);

  return { data, loading, refreshing, error, retry: () => void load() };
}
