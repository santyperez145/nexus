"use client";

import { useCallback, useEffect, useState } from "react";

export function useRemoteData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const reload = useCallback(() => {
    fetch(path)
      .then((r) => r.json())
      .then((json: { data?: T }) => setData(json.data ?? null))
      .catch(() => undefined);
  }, [path]);

  useEffect(() => {
    const ac = new AbortController();
    fetch(path, { signal: ac.signal })
      .then((r) => r.json())
      .then((json: { data?: T }) => {
        if (!ac.signal.aborted) setData(json.data ?? null);
      })
      .catch(() => undefined);
    return () => ac.abort();
  }, [path]);

  return [data, reload] as const;
}
