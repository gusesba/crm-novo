"use client";
import { api } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
export function useResource<T>(path: string | null, interval?: number) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((x) => x + 1), []);
  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let active = true;
    let inFlight = false;
    const controller = new AbortController();
    setLoading(true);
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await api<T>(path, { signal: controller.signal });
        if (active) {
          setData(result);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Falha ao carregar.");
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = interval ? setInterval(load, interval) : undefined;
    return () => {
      active = false;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [path, revision, interval]);
  return { data, error, loading, reload };
}
