"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncData<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** サーバーから読み直す(リアルタイム通知を受けたときなど) */
  refresh: () => void;
  /** 楽観更新用。通信を待たずに画面だけ先に動かす */
  setData: React.Dispatch<React.SetStateAction<T | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
};

/**
 * 「key が変わったら読み直す」だけの小さなデータ取得フック。
 *
 * fetcher は毎レンダリング新しい関数で渡されるのが普通なので ref に逃がし、
 * 再取得のトリガーは key と refresh() の nonce だけにしてある。
 */
export function useAsyncData<T>(key: string, fetcher: () => Promise<T>): AsyncData<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const next = await fetcherRef.current();
        if (!active) return;
        setData(next);
        setError(null);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [key, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, refresh, setData, setError };
}
