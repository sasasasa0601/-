"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getRoomClient, isSupabaseConfigured } from "./supabase";

function makeClientId(): string {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/**
 * ルーム単位のリアルタイム同期。
 *
 * Postgres Changes ではなく Broadcast を使う。
 * このアプリの RLS は HTTP ヘッダ (x-share-code) を見るが、Realtime の
 * WAL 購読には HTTP ヘッダが存在せず RLS が必ず fail-closed になるため。
 * 代わりに「変更したよ」の合図だけを飛ばし、受け取った端末が自分で読み直す。
 * チャンネル名に推測不可能な share_code を使うので、同席者以外は覗けない。
 *
 * @param onRemoteChange 他の端末が更新したときに呼ばれる(自分の更新では呼ばれない)
 * @returns 自分が更新したあとに呼ぶ通知関数
 */
export function useRoomChannel(
  shareCode: string,
  onRemoteChange: () => void,
): () => void {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const handlerRef = useRef(onRemoteChange);
  // 自分が送った broadcast を自分で拾わないための ID
  const [clientId] = useState(makeClientId);

  useEffect(() => {
    handlerRef.current = onRemoteChange;
  }, [onRemoteChange]);

  useEffect(() => {
    if (!isSupabaseConfigured || !shareCode) return;

    const client = getRoomClient(shareCode);
    const channel = client
      .channel(`room:${shareCode}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "changed" }, (message) => {
        if (message.payload?.sender === clientId) return;
        handlerRef.current();
      })
      .subscribe();

    channelRef.current = channel;

    // 復帰時の取りこぼし対策: 画面に戻ってきたら読み直す
    const onVisible = () => {
      if (document.visibilityState === "visible") handlerRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      channelRef.current = null;
      void client.removeChannel(channel);
    };
  }, [shareCode, clientId]);

  return useCallback(() => {
    void channelRef.current?.send({
      type: "broadcast",
      event: "changed",
      payload: { sender: clientId, at: Date.now() },
    });
  }, [clientId]);
}
