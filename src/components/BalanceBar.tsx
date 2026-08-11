"use client";

import type { SessionSummary } from "@/lib/calc";
import { formatChips, formatSigned } from "@/lib/format";

/**
 * 「プラマイゼロ」バリデーションの表示。
 * 差分が出ているときは、どちらに何枚ズレているかを言い切る。
 */
export function BalanceBar({ summary }: { summary: SessionSummary }) {
  const { totalBuyIn, totalCashOut, diff, missingCount, isBalanced } = summary;

  const tone = isBalanced
    ? "bg-chip-win/10 ring-chip-win/30 text-chip-win"
    : missingCount > 0
      ? "bg-white/5 ring-white/10 text-ink-300"
      : "bg-chip-lose/10 ring-chip-lose/30 text-chip-lose";

  const message = isBalanced
    ? "プラマイゼロ。確定できます"
    : missingCount > 0
      ? `最終チップが未入力: ${missingCount} 人`
      : diff > 0
        ? `チップが ${formatChips(diff)} 枚 多すぎます`
        : `チップが ${formatChips(-diff)} 枚 足りません`;

  return (
    <div className={`rounded-2xl px-4 py-3 ring-1 ring-inset ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {isBalanced ? (
            <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v5m0 3.5h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          )}
          <span>{message}</span>
        </div>
        {missingCount === 0 && (
          <span className="tabnum shrink-0 text-lg font-bold">{formatSigned(diff)}</span>
        )}
      </div>

      <dl className="mt-2 flex gap-4 text-xs text-ink-300">
        <div className="flex gap-1.5">
          <dt>初期合計</dt>
          <dd className="tabnum text-ink-50">{formatChips(totalBuyIn)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>最終合計</dt>
          <dd className="tabnum text-ink-50">{formatChips(totalCashOut)}</dd>
        </div>
      </dl>
    </div>
  );
}
