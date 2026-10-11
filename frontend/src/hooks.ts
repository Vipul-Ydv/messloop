import { useCallback, useEffect, useRef, useState } from "react";

// Small data-loading hook. Data is kept while a reload runs, so polling never flashes a skeleton.
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, set] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    set((s) => ({ ...s, loading: true }));
    fnRef.current()
      .then((data) => { if (live) set({ data, error: null, loading: false }); })
      .catch((error) => { if (live) set((s) => ({ data: s.data, error, loading: false })); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

// The API may answer with a bare array or an object wrapping one; accept both.
export function asList<T>(x: unknown, ...keys: string[]): T[] {
  if (Array.isArray(x)) return x as T[];
  if (x && typeof x === "object") {
    for (const k of [...keys, "items", "data"]) {
      const v = (x as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}
