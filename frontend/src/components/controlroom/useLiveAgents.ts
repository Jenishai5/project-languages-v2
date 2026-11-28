import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAgentsLive, type AgentsLive } from "../../lib/agentsApi";

const POLL_MS = 4000;

export interface LiveFeed {
  live:      AgentsLive | null;
  error:     string | null;
  updatedAt: number | null;
  refresh:   () => void;
}

export function useLiveAgents(enabled: boolean): LiveFeed {
  const [live, setLive] = useState<AgentsLive | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const data = await fetchAgentsLive();
      setLive(data);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live data is not available.");
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => { void load(); }, POLL_MS); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVisibility = () => {
      if (document.hidden) stop();
      else { void load(); start(); }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [enabled, load]);

  return { live, error, updatedAt, refresh: load };
}
