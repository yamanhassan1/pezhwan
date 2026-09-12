import { useState, useCallback, useEffect, useRef, type DependencyList } from 'react';

interface UseApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  run: (...args: never[]) => Promise<T | null>;
}

export function useApi<T>(fn: (...args: never[]) => Promise<T>): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: never[]): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await fn(...args);
        if (mountedRef.current) {
          setData(result);
        }
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (mountedRef.current) {
          setError(msg);
        }
        return null;
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [fn],
  );

  return { data, error, loading, run };
}

export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList): UseApiResult<T> {
  const stableFn = useRef(fn);
  stableFn.current = fn;

  const wrappedFn = useCallback(() => stableFn.current(), []);

  const result = useApi(wrappedFn);

  useEffect(() => {
    result.run();
  }, deps);

  return result;
}
