"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addSessionPlayer,
  deleteSession,
  ensurePlayer,
  loadSessionView,
  removeSessionPlayer,
  updateSession,
  updateSessionPlayer,
} from "@/lib/api";
import { summarize, settlements, type ChipRow } from "@/lib/calc";
import { formatChips, toDateTimeLocal } from "@/lib/format";
import type { GameSession, SessionPlayer } from "@/lib/types";
import { useAsyncData } from "@/lib/useAsyncData";
import { useRoomChannel } from "@/lib/useRoomChannel";
import { BalanceBar } from "@/components/BalanceBar";
import { PlayerCard } from "@/components/PlayerCard";
import { ShareButton } from "@/components/ShareButton";
import { Button, ChipInput, ErrorNote, Spinner, TextInput } from "@/components/ui";

type Patch = Partial<Pick<SessionPlayer, "name" | "buy_in" | "cash_out">>;

const SAVE_DEBOUNCE_MS = 600;

export function SessionScreen({
  shareCode,
  sessionId,
}: {
  shareCode: string;
  sessionId: string;
}) {
  const router = useRouter();
  const [bulkBuyIn, setBulkBuyIn] = useState("");

  // 入力のたびに通信すると重いので、保存はまとめて遅延実行する
  const pendingRef = useRef(new Map<string, Patch>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const view = useAsyncData(`${shareCode}/${sessionId}`, () =>
    loadSessionView(shareCode, sessionId),
  );
  const { refresh, setData, setError } = view;

  const room = view.data?.room ?? null;
  const session = view.data?.session ?? null;
  const roster = useMemo(() => view.data?.roster ?? [], [view.data]);
  const players = useMemo(() => view.data?.players ?? [], [view.data]);

  // 保存待ちの編集を抱えている間は、リモートの内容で上書きしない
  const handleRemoteChange = useCallback(() => {
    if (pendingRef.current.size === 0) refresh();
  }, [refresh]);
  const notify = useRoomChannel(shareCode, handleRemoteChange);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const entries = [...pendingRef.current.entries()];
    pendingRef.current.clear();
    if (entries.length === 0) return;

    try {
      await Promise.all(
        entries.map(([id, patch]) => updateSessionPlayer(shareCode, id, patch)),
      );
      notify();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    }
  }, [shareCode, notify, setError]);

  // 画面を離れるときに未保存分を書き切る
  useEffect(() => () => void flush(), [flush]);

  const queueSave = useCallback(
    (id: string, patch: Patch) => {
      pendingRef.current.set(id, { ...pendingRef.current.get(id), ...patch });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  /** 画面はすぐ更新し(楽観更新)、通信はあとから追いかける */
  const patchPlayer = useCallback(
    (id: string, patch: Patch) => {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) => {
            if (p.id !== id) return p;
            const next = { ...p, ...patch };
            next.net = next.cash_out === null ? null : next.cash_out - next.buy_in;
            return next;
          }),
        };
      });
      queueSave(id, patch);
    },
    [setData, queueSave],
  );

  const applySession = useCallback(
    (updated: GameSession) => {
      setData((prev) => (prev ? { ...prev, session: updated } : prev));
    },
    [setData],
  );

  const rows: ChipRow[] = useMemo(
    () => players.map((p) => ({ buyIn: p.buy_in, cashOut: p.cash_out })),
    [players],
  );
  const summary = useMemo(() => summarize(rows), [rows]);

  const readOnly = session?.status === "closed";
  /** 直前の人と同じ初期チップで始めるのが普通なので、それを引き継ぐ */
  const defaultBuyIn = players.length > 0 ? players[players.length - 1].buy_in : 0;

  async function handleAddPlayer() {
    try {
      const created = await addSessionPlayer(shareCode, sessionId, {
        seatNo: players.length,
        buyIn: defaultBuyIn,
      });
      setData((prev) => (prev ? { ...prev, players: [...prev.players, created] } : prev));
      notify();
    } catch (e) {
      setError(e instanceof Error ? e.message : "プレイヤーを追加できませんでした");
    }
  }

  async function handleRemovePlayer(id: string) {
    setData((prev) =>
      prev ? { ...prev, players: prev.players.filter((p) => p.id !== id) } : prev,
    );
    pendingRef.current.delete(id);
    try {
      await removeSessionPlayer(shareCode, id);
      notify();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除できませんでした");
      refresh();
    }
  }

  function handleBulkBuyIn() {
    const amount = Number(bulkBuyIn);
    if (!Number.isFinite(amount) || amount < 0) return;
    for (const player of players) {
      patchPlayer(player.id, { buy_in: Math.trunc(amount) });
    }
    setBulkBuyIn("");
  }

  async function handleSaveSession(
    patch: Partial<Pick<GameSession, "title" | "played_at" | "status">>,
  ) {
    try {
      applySession(await updateSession(shareCode, sessionId, patch));
      notify();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    }
  }

  async function handleClose() {
    await flush();
    try {
      applySession(await updateSession(shareCode, sessionId, { status: "closed" }));
      setError(null);
      // 名簿に入れておくと、次の試合で名前を候補から選べる
      if (room) {
        const names = [...new Set(players.map((p) => p.name.trim()).filter(Boolean))];
        await Promise.allSettled(names.map((name) => ensurePlayer(shareCode, room.id, name)));
      }
      notify();
    } catch (e) {
      setError(e instanceof Error ? e.message : "確定できませんでした");
    }
  }

  async function handleDelete() {
    if (!window.confirm("この試合を削除します。元に戻せません。")) return;
    try {
      await deleteSession(shareCode, sessionId);
      notify();
      router.replace(`/r/${shareCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除できませんでした");
    }
  }

  if (view.loading) return <Spinner />;

  if (!session) {
    return (
      <main className="space-y-4 p-5 pt-16">
        <h1 className="text-xl font-bold">試合が見つかりません</h1>
        <Link href={`/r/${shareCode}`} className="inline-block text-sm text-chip-gold underline">
          ルームへ戻る
        </Link>
      </main>
    );
  }

  const plan = readOnly
    ? settlements(players.map((p) => ({ name: p.name || "名前なし", net: p.net })))
    : [];

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-2 px-5 pt-6 pb-3">
        <Link
          href={`/r/${shareCode}`}
          aria-label="ルームへ戻る"
          className="-ml-2 grid size-11 shrink-0 place-items-center rounded-xl text-ink-300 active:bg-white/10"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="m15 5-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">
          {session.title || "試合の記録"}
        </h1>
        <ShareButton
          className="shrink-0"
          url={`/r/${shareCode}/s/${sessionId}`}
          title="ポーカーの結果"
        />
      </header>

      <div className="flex-1 space-y-4 px-5 pb-56">
        {view.error && <ErrorNote message={view.error} />}

        <div className="grid grid-cols-1 gap-2">
          <TextInput
            defaultValue={session.title}
            maxLength={60}
            placeholder="メモ（例: 第 12 回・自宅）"
            aria-label="試合のタイトル"
            disabled={readOnly}
            onBlur={(e) => {
              const title = e.target.value.trim();
              if (title !== session.title) void handleSaveSession({ title });
            }}
          />
          <TextInput
            type="datetime-local"
            defaultValue={toDateTimeLocal(session.played_at)}
            aria-label="日時"
            disabled={readOnly}
            onChange={(e) => {
              if (!e.target.value) return;
              void handleSaveSession({
                played_at: new Date(e.target.value).toISOString(),
              });
            }}
          />
        </div>

        {!readOnly && players.length > 0 && (
          <div className="flex items-center gap-2">
            <ChipInput
              value={bulkBuyIn}
              placeholder="初期チップを全員に"
              aria-label="初期チップを全員に一括設定"
              className="text-left text-base"
              onChange={(e) => setBulkBuyIn(e.target.value)}
            />
            <Button className="shrink-0" disabled={bulkBuyIn === ""} onClick={handleBulkBuyIn}>
              一括
            </Button>
          </div>
        )}

        <ul className="space-y-3">
          {players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              chipRate={room?.chip_rate ?? 0}
              rebuyStep={defaultBuyIn}
              readOnly={!!readOnly}
              nameOptions={roster}
              onChange={(patch) => patchPlayer(player.id, patch)}
              onRemove={() => void handleRemovePlayer(player.id)}
            />
          ))}
        </ul>

        {/* 要件: 「＋」をタップして直感的に人数を増やせる */}
        {!readOnly && (
          <button
            type="button"
            onClick={() => void handleAddPlayer()}
            className="flex min-h-16 w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-white/15 text-ink-300 transition-colors active:border-chip-gold/50 active:bg-white/5 active:text-chip-gold"
          >
            <span className="grid size-8 place-items-center rounded-full bg-white/10 text-xl leading-none font-bold">
              ＋
            </span>
            <span className="text-sm font-semibold">プレイヤーを追加</span>
          </button>
        )}

        {readOnly && plan.length > 0 && (
          <section className="space-y-2 pt-2">
            <h2 className="px-1 text-sm font-bold">精算</h2>
            <ul className="space-y-1.5 rounded-3xl bg-white/[0.04] p-4 ring-1 ring-inset ring-white/10">
              {plan.map((p, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-chip-lose">{p.from}</span>
                  <span className="shrink-0 text-ink-500">→</span>
                  <span className="min-w-0 flex-1 truncate text-chip-win">{p.to}</span>
                  <span className="tabnum shrink-0 font-bold">{formatChips(p.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {readOnly && (
          <div className="flex gap-2 pt-4">
            <Button className="flex-1" onClick={() => void handleSaveSession({ status: "open" })}>
              再編集する
            </Button>
            <Button variant="danger" onClick={() => void handleDelete()}>
              削除
            </Button>
          </div>
        )}
      </div>

      {/* 常に見える集計＋確定バー */}
      <div className="sticky bottom-0 space-y-3 border-t border-white/10 bg-felt-950/85 px-5 pt-3 pb-safe backdrop-blur">
        <BalanceBar summary={summary} />
        {readOnly ? (
          <p className="pb-1 text-center text-sm font-semibold text-chip-win">
            確定済み — 全員の増減の合計は ±0 です
          </p>
        ) : (
          <Button
            variant="primary"
            size="lg"
            className="mb-1 w-full"
            disabled={!summary.isBalanced}
            onClick={() => void handleClose()}
          >
            {summary.isBalanced ? "この結果で確定する" : "確定できません"}
          </Button>
        )}
      </div>
    </main>
  );
}
