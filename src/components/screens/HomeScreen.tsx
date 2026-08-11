"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createRoom } from "@/lib/api";
import { isValidShareCode } from "@/lib/shareCode";
import {
  getRecentRooms,
  getRecentRoomsServerSnapshot,
  rememberRoom,
  subscribeRecentRooms,
} from "@/lib/recentRooms";
import { Button, Card, ErrorNote, TextInput } from "@/components/ui";

export function HomeScreen() {
  const router = useRouter();
  const recent = useSyncExternalStore(
    subscribeRecentRooms,
    getRecentRooms,
    getRecentRoomsServerSnapshot,
  );
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom(roomName);
      rememberRoom(room.share_code, room.name);
      router.push(`/r/${room.share_code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ルームを作成できませんでした");
      setBusy(false);
    }
  }

  function handleJoin() {
    const code = joinCode.trim().toLowerCase();
    if (!isValidShareCode(code)) {
      setError("コードの形式が正しくありません");
      return;
    }
    router.push(`/r/${code}`);
  }

  return (
    <main className="flex min-h-dvh flex-col gap-6 p-5 pb-safe">
      <header className="pt-10 pb-2">
        <p className="text-xs tracking-[0.3em] text-chip-gold/80">CHIP LEDGER</p>
        <h1 className="mt-2 text-3xl leading-tight font-bold">
          ポーカーの
          <br />
          チップ計算と記録
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-300">
          初期チップと最終チップを入れるだけで増減を自動計算。
          URL を送れば、その場の全員が同じ結果を見られます。
        </p>
      </header>

      {error && <ErrorNote message={error} />}

      <Card className="space-y-3">
        <h2 className="text-sm font-bold">ルームを作る</h2>
        <p className="text-xs leading-relaxed text-ink-300">
          いつものメンバーで 1 つ作れば、以降の試合の履歴がそこに貯まります。
        </p>
        <TextInput
          value={roomName}
          maxLength={60}
          placeholder="ルーム名（例: 金曜ポーカー）"
          aria-label="ルーム名"
          onChange={(e) => setRoomName(e.target.value)}
        />
        <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={handleCreate}>
          {busy ? "作成中…" : "新しいルームを作る"}
        </Button>
      </Card>

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-bold">最近のルーム</h2>
          <ul className="space-y-2">
            {recent.map((room) => (
              <li key={room.code}>
                <Link
                  href={`/r/${room.code}`}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-4 ring-1 ring-inset ring-white/10 active:bg-white/10"
                >
                  <span className="truncate font-medium">{room.name}</span>
                  <span className="shrink-0 text-xs text-ink-500">{room.code.slice(0, 4)}…</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card className="space-y-3">
        <h2 className="text-sm font-bold">コードで参加</h2>
        <div className="flex gap-2">
          <TextInput
            value={joinCode}
            placeholder="共有コード"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="共有コード"
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <Button className="shrink-0" onClick={handleJoin}>
            参加
          </Button>
        </div>
      </Card>

      <p className="mt-auto px-1 pt-4 text-center text-[11px] leading-relaxed text-ink-500">
        ログイン不要。ルームの URL がそのまま合鍵です。
        <br />
        知らない人に URL を渡さないでください。
      </p>
    </main>
  );
}
