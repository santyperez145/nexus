"use client";

import { useCallback, useEffect, useState } from "react";

type RemoteEnvelope<T, M> = {
  data?: T;
  meta?: M;
  error?: { message?: string };
};

async function readRemoteData<T, M>(path: string, signal?: AbortSignal) {
  const response = await fetch(path, { signal });
  let json: RemoteEnvelope<T, M>;
  try {
    json = (await response.json()) as RemoteEnvelope<T, M>;
  } catch {
    throw new Error(`Respuesta inválida (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(json.error?.message || `Solicitud rechazada (${response.status})`);
  }
  if (!("data" in json)) {
    throw new Error("La respuesta no contiene datos");
  }
  return { data: json.data ?? null, meta: json.meta ?? null };
}

export function useRemoteData<T, M = unknown>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<M | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      const next = await readRemoteData<T, M>(path, signal);
      if (!signal?.aborted) {
        setData(next.data);
        setMeta(next.meta);
      }
    } catch (reason) {
      if (signal?.aborted) return;
      setError(reason instanceof Error ? reason.message : "No se pudo cargar la información");
    }
  }, [path]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ac = new AbortController();
    void readRemoteData<T, M>(path, ac.signal)
      .then((next) => {
        if (!ac.signal.aborted) {
          setData(next.data);
          setMeta(next.meta);
        }
      })
      .catch((reason) => {
        if (!ac.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "No se pudo cargar la información");
        }
      });
    return () => ac.abort();
  }, [path]);

  return [data, reload, error, meta] as const;
}
