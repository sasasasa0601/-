"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSession, loadRoomView, updateRoom } from "@/lib/api";
import { rememberRoom } from "@/lib/recentRooms";
import { useAsyncData } from "@/lib/useAsyncData";
import { useRoomChannel } from "@/lib/useRoomChannel";
import { formatDateTime, formatSigned } from "@/lib/format";
import type { Room, SessionWithPlayers, Standing } from "@/lib/types";
import { Button, Card, ErrorNote, Spinner, TextInput } from "@/components/ui";
import { ShareButton } from "@/components/ShareButton";

type Tab = "history" | "standings";

export function RoomScreen({ shareCode }: { shareCode: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("history");
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);

  const view = useAsyncData(shareCode, async () => {
    const next = await loadRoomView(shareCode);
    // 一度開いたルームはトップから戻れるようにしておく
    if (next.room) rememberRoom(next.room.share_code, next.room.name);
    return next;
  });

  const { refresh, setData, setError } = view;
  useRoomChannel(shareCode, refresh);

  const room = view.data?.room ?? null;
  const sessions = view.data?.sessions ?? [];
  const standings = view.data?.standings ?? [];
  const error = view.error;

  async function startSession() {
    if (!room) return;
    setBusy(true);
    try {
      const session = await createSession(shareCode, room.id);
      router.push(`/r/${shareCode}/s/${session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "試合を作成できませんでした");
      setBusy(false);
    }
  }

  const saveRoom = useCallback(
    async (patch: Partial<Pick<Room, "name" | "chip_rate">>) => {
      try {
        const updated = await updateRoom(shareCode, patch);
        setData((prev) => (prev ? { ...prev, room: updated } : prev));
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    },
    [shareCode, setData, setError],
  );

  if (view.loading) return <Spinner />;

  if (!room) {
    return (
      <main className="space-y-4 p-5 pt-16">
        <h1 className="text-xl font-bold">ルームが見つかりません</h1>
        <p className="text-sm leading-relaxed text-ink-300">
          URL が途中で切れているか、ルームが削除された可能性があります。
        </p>
        <Link href="/" className="inline-block text-sm text-chip-gold underline">
          トップへ戻る
        </Link>
      </main>
    );
  }

  const openSessions = sessions.filter((s) => s.status === "open");
  const closedSessions = sessions.filter((s) => s.status === "closed");

  return (
    <main className="flex min-h-dvh flex-col gap-5 p-5 pb-safe">
      <header className="flex items-start justify-between gap-3 pt-6">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] tracking-[0.25em] text-chip-gold/80">ROOM</p>
          {editingName ? (
            <TextInput
              autoFocus
              defaultValue={room.name}
              maxLength={60}
              aria-label="ルーム名"
              className="mt-1"
              onBlur={(e) => {
                setEditingName(false);
                const next = e.target.value.trim();
                if (next && next !== room.name) void saveRoom({ name: next });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="mt-1 block max-w-full truncate text-left text-2xl font-bold"
            >
              {room.name}
            </button>
          )}
        </div>
        <ShareButton
          className="mt-4 shrink-0"
          url={`/r/${shareCode}`}
          title={`${room.name} のチップ記録`}
        />
      </header>

      {error && <ErrorNote message={error} />}

      <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={startSession}>
        {busy ? "準備中…" : "＋ 新しい試合をはじめる"}
      </Button>

      {openSessions.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-bold">進行中</h2>
          {openSessions.map((session) => (
            <Link key={session.id} href={`/r/${shareCode}/s/${session.id}`} className="block">
              <Card className="flex items-center justify-between gap-3 ring-chip-gold/30 active:bg-white/10">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {session.title || formatDateTime(session.played_at)}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-300">
                    {session.session_players.length} 人が参加中
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-chip-gold/15 px-3 py-1 text-xs font-semibold text-chip-gold">
                  続きから
                </span>
              </Card>
            </Link>
          ))}
        </section>
      )}

      <div className="flex gap-1 rounded-2xl bg-white/5 p-1">
        {(
          [
            ["history", "履歴"],
            ["standings", "通算成績"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`min-h-10 flex-1 rounded-xl text-sm font-semibold transition-colors ${
              tab === value ? "bg-white/10 text-ink-50" : "text-ink-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "history" ? (
        <HistoryList shareCode={shareCode} sessions={closedSessions} />
      ) : (
        <StandingsList standings={standings} />
      )}

      <section className="mt-auto pt-6">
        <Card className="space-y-2">
          <label htmlFor="chip-rate" className="block text-xs font-medium text-ink-300">
            1 チップあたりの金額（0 なら金額を表示しない）
          </label>
          <div className="flex items-center gap-2">
            <TextInput
              id="chip-rate"
              inputMode="decimal"
              defaultValue={String(room.chip_rate)}
              className="text-right tabnum"
              onBlur={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next) && next >= 0 && next !== room.chip_rate) {
                  void saveRoom({ chip_rate: next });
                }
              }}
            />
            <span className="shrink-0 text-sm text-ink-300">円 / チップ</span>
          </div>
        </Card>
      </section>
    </main>
  );
}

function HistoryList({
  shareCode,
  sessions,
}: {
  shareCode: string;
  sessions: SessionWithPlayers[];
}) {
  if (sessions.length === 0) {
    return (
      <p className="rounded-2xl bg-white/[0.03] px-4 py-10 text-center text-sm text-ink-300">
        まだ確定した試合がありません。
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {sessions.map((session) => (
        <li key={session.id}>
          <Link href={`/r/${shareCode}/s/${session.id}`} className="block">
            <Card className="active:bg-white/10">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold">{formatDateTime(session.played_at)}</p>
                <p className="shrink-0 text-xs text-ink-500">
                  {session.session_players.length} 人
                </p>
              </div>
              {session.title && (
                <p className="mt-0.5 truncate text-xs text-ink-300">{session.title}</p>
              )}
              <ul className="mt-3 space-y-1.5">
                {[...session.session_players]
                  .sort((a, b) => (b.net ?? 0) - (a.net ?? 0))
                  .map((player) => (
                    <li key={player.id} className="flex justify-between gap-3 text-sm">
                      <span className="truncate text-ink-300">
                        {player.name || "名前なし"}
                      </span>
                      <span
                        className={`tabnum shrink-0 font-semibold ${
                          (player.net ?? 0) > 0
                            ? "text-chip-win"
                            : (player.net ?? 0) < 0
                              ? "text-chip-lose"
                              : "text-ink-300"
                        }`}
                      >
                        {formatSigned(player.net ?? 0)}
                      </span>
                    </li>
                  ))}
              </ul>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StandingsList({ standings }: { standings: Standing[] }) {
  if (standings.length === 0) {
    return (
      <p className="rounded-2xl bg-white/[0.03] px-4 py-10 text-center text-sm text-ink-300">
        確定した試合が貯まると、ここに通算成績が出ます。
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {standings.map((row, index) => (
        <li
          key={row.name}
          className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-4 py-3 ring-1 ring-inset ring-white/10"
        >
          <span className="tabnum w-5 shrink-0 text-sm text-ink-500">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{row.name}</p>
            <p className="text-xs text-ink-500">
              {row.games} 戦 {row.wins} 勝
            </p>
          </div>
          <span
            className={`tabnum shrink-0 text-lg font-bold ${
              row.total_net > 0
                ? "text-chip-win"
                : row.total_net < 0
                  ? "text-chip-lose"
                  : "text-ink-300"
            }`}
          >
            {formatSigned(row.total_net)}
          </span>
        </li>
      ))}
    </ul>
  );
}
