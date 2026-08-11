"use client";

import { useEffect, useRef, useState } from "react";
import type { SessionPlayer } from "@/lib/types";
import { formatSigned, formatYen, parseIntOrNull, toYen } from "@/lib/format";
import { ChipInput, TextInput } from "./ui";

type Patch = Partial<Pick<SessionPlayer, "name" | "buy_in" | "cash_out">>;

/**
 * 参加者 1 人分のカード。
 * 入力は即座に画面へ反映し、保存は親側で束ねる(楽観更新)。
 */
export function PlayerCard({
  player,
  chipRate,
  rebuyStep,
  readOnly,
  nameOptions,
  onChange,
  onRemove,
}: {
  player: SessionPlayer;
  chipRate: number;
  rebuyStep: number;
  readOnly: boolean;
  nameOptions: string[];
  onChange: (patch: Patch) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(player.name);
  const [buyIn, setBuyIn] = useState(String(player.buy_in));
  const [cashOut, setCashOut] = useState(
    player.cash_out === null ? "" : String(player.cash_out),
  );
  const focusedRef = useRef(false);

  // 他の端末からの更新を取り込む。入力中の欄は上書きしない。
  useEffect(() => {
    if (focusedRef.current) return;
    setName(player.name);
    setBuyIn(String(player.buy_in));
    setCashOut(player.cash_out === null ? "" : String(player.cash_out));
  }, [player.name, player.buy_in, player.cash_out]);

  const buyInNum = parseIntOrNull(buyIn) ?? 0;
  const cashOutNum = parseIntOrNull(cashOut);
  const net = cashOutNum === null ? null : cashOutNum - buyInNum;
  const yen = net === null ? null : toYen(net, chipRate);

  const netTone =
    net === null
      ? "text-ink-500"
      : net > 0
        ? "text-chip-win"
        : net < 0
          ? "text-chip-lose"
          : "text-ink-300";

  function addRebuy() {
    const next = buyInNum + rebuyStep;
    setBuyIn(String(next));
    onChange({ buy_in: next });
  }

  return (
    <li className="rounded-3xl bg-white/[0.04] p-3 ring-1 ring-inset ring-white/10">
      <div className="flex items-center gap-2">
        <TextInput
          value={name}
          placeholder="プレイヤー名"
          list="player-name-options"
          disabled={readOnly}
          aria-label="プレイヤー名"
          onFocus={() => (focusedRef.current = true)}
          onBlur={() => {
            focusedRef.current = false;
            onChange({ name: name.trim() });
          }}
          onChange={(e) => {
            setName(e.target.value);
            onChange({ name: e.target.value.trim() });
          }}
        />
        {!readOnly && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${player.name || "このプレイヤー"}を削除`}
            className="grid size-11 shrink-0 place-items-center rounded-xl text-ink-500 active:bg-white/10 active:text-chip-lose"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <div>
          <span className="mb-1 block text-[11px] text-ink-300">初期チップ</span>
          <ChipInput
            value={buyIn}
            placeholder="0"
            disabled={readOnly}
            aria-label="初期チップ"
            onFocus={(e) => {
              focusedRef.current = true;
              e.currentTarget.select();
            }}
            onBlur={() => {
              focusedRef.current = false;
              setBuyIn(String(buyInNum));
              onChange({ buy_in: buyInNum });
            }}
            onChange={(e) => {
              setBuyIn(e.target.value);
              onChange({ buy_in: parseIntOrNull(e.target.value) ?? 0 });
            }}
          />
        </div>

        <div>
          <span className="mb-1 block text-[11px] text-ink-300">最終チップ</span>
          <ChipInput
            value={cashOut}
            placeholder="—"
            disabled={readOnly}
            aria-label="最終チップ"
            onFocus={(e) => {
              focusedRef.current = true;
              e.currentTarget.select();
            }}
            onBlur={() => {
              focusedRef.current = false;
              setCashOut(cashOutNum === null ? "" : String(cashOutNum));
              onChange({ cash_out: cashOutNum });
            }}
            onChange={(e) => {
              setCashOut(e.target.value);
              onChange({ cash_out: parseIntOrNull(e.target.value) });
            }}
          />
        </div>

        <div className="pb-1 text-right">
          <span className="mb-1 block text-[11px] text-ink-300">増減</span>
          <span className={`tabnum block text-lg leading-6 font-bold ${netTone}`}>
            {net === null ? "—" : formatSigned(net)}
          </span>
          {yen !== null && (
            <span className={`tabnum block text-[11px] ${netTone}`}>{formatYen(yen)}</span>
          )}
        </div>
      </div>

      {!readOnly && rebuyStep > 0 && (
        <button
          type="button"
          onClick={addRebuy}
          className="mt-2 min-h-9 rounded-lg px-2 text-xs text-ink-300 active:bg-white/10 active:text-ink-50"
        >
          ＋リバイ {rebuyStep.toLocaleString("ja-JP")}
        </button>
      )}

      <datalist id="player-name-options">
        {nameOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </li>
  );
}
